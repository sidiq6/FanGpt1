-- FanGpt schema. Apply once in the Supabase SQL Editor or via `supabase db push`.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '', full_name text not null default '',
 is_active boolean not null default true,
 daily_limit integer not null default 60 check(daily_limit between 0 and 500),
 created_at timestamptz not null default now()
);
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(id,user_id)
);
create index conversations_owner_updated on public.conversations(user_id,updated_at desc);
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null, user_id uuid not null,
 role text not null check(role in ('user','assistant')), content text not null default '',
 status text not null default 'complete' check(status in ('complete','pending','error','stopped')),
 model text, created_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
 unique(id,conversation_id,user_id)
);
create index messages_chat_time on public.messages(conversation_id,created_at);
create unique index one_pending_reply on public.messages(conversation_id) where status='pending';
create table public.attachments (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null, user_id uuid not null, message_id uuid,
 path text not null unique, name text not null, mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 size integer not null check(size between 1 and 4194304), created_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.conversations(id,user_id) on delete cascade,
 foreign key(message_id,conversation_id,user_id) references public.messages(id,conversation_id,user_id) on delete cascade
);
create index attachments_chat on public.attachments(conversation_id,user_id);
create table public.usage_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 status text not null, error_code text, model text not null, total_tokens integer not null default 0,
 latency_ms integer not null default 0, created_at timestamptz not null default now()
);
create index usage_events_time on public.usage_events(created_at desc);
create table public.daily_usage (user_id uuid not null references auth.users(id) on delete cascade, day date not null, requests integer not null default 0, primary key(user_id,day));
create table public.minute_usage (user_id uuid not null references auth.users(id) on delete cascade, minute timestamptz not null, requests integer not null default 0, primary key(user_id,minute));

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1),''),100))
 on conflict(id) do update set email=excluded.email;
 return new;
end;$$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
create trigger fangpt_new_user after insert or update of email on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,email,full_name) select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'full_name',split_part(email,'@',1),''),100) from auth.users on conflict(id) do nothing;

create function public.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_active from public.profiles where id=(select auth.uid())),false);
$$;
revoke all on function public.is_active_user() from public,anon,authenticated;
grant execute on function public.is_active_user() to authenticated;

-- Serializes quota reservations across concurrent server instances.
create function public.consume_ai_request(p_user_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare cap integer; used integer; recent integer; current_minute timestamptz:=date_trunc('minute',now());
begin
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 select daily_limit into cap from public.profiles where id=p_user_id and is_active=true;
 if cap is null then return false; end if;
 select requests into used from public.daily_usage where user_id=p_user_id and day=(now() at time zone 'UTC')::date;
 select requests into recent from public.minute_usage where user_id=p_user_id and minute=current_minute;
 if coalesce(used,0)>=cap or coalesce(recent,0)>=6 then return false; end if;
 insert into public.daily_usage(user_id,day,requests) values(p_user_id,(now() at time zone 'UTC')::date,1) on conflict(user_id,day) do update set requests=public.daily_usage.requests+1;
 insert into public.minute_usage(user_id,minute,requests) values(p_user_id,current_minute,1) on conflict(user_id,minute) do update set requests=public.minute_usage.requests+1;
 -- Recover replies interrupted by a terminated worker; it never unlocks a live (<2 min) stream.
 update public.messages set status='error' where user_id=p_user_id and status='pending' and created_at<now()-interval '2 minutes';
 delete from public.minute_usage where user_id=p_user_id and minute<now()-interval '1 day';
 return true;
end;$$;
revoke all on function public.consume_ai_request(uuid) from public,anon,authenticated;
grant execute on function public.consume_ai_request(uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.usage_events enable row level security;
alter table public.daily_usage enable row level security;
alter table public.minute_usage enable row level security;
revoke all on public.profiles,public.admin_users,public.conversations,public.messages,public.attachments,public.usage_events,public.daily_usage,public.minute_usage from anon,authenticated;
grant all on public.profiles,public.admin_users,public.conversations,public.messages,public.attachments,public.usage_events,public.daily_usage,public.minute_usage to service_role;
grant select on public.profiles,public.messages,public.attachments to authenticated;
grant select,insert on public.conversations to authenticated;
grant update(title,updated_at) on public.conversations to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using((select auth.uid())=id);
create policy conversations_read_self on public.conversations for select to authenticated using((select auth.uid())=user_id and deleted_at is null and (select public.is_active_user()));
create policy conversations_insert_self on public.conversations for insert to authenticated with check((select auth.uid())=user_id and deleted_at is null and (select public.is_active_user()));
create policy conversations_update_self on public.conversations for update to authenticated using((select auth.uid())=user_id and deleted_at is null and (select public.is_active_user())) with check((select auth.uid())=user_id and deleted_at is null and (select public.is_active_user()));
create policy messages_read_self on public.messages for select to authenticated using((select auth.uid())=user_id and (select public.is_active_user()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.deleted_at is null));
create policy attachments_read_self on public.attachments for select to authenticated using((select auth.uid())=user_id and (select public.is_active_user()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.deleted_at is null));

-- Private objects are uploaded/deleted only by the authenticated server routes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('chat-images','chat-images',false,4194304,array['image/jpeg','image/png','image/webp']);
create policy fangpt_images_read_self on storage.objects for select to authenticated using(
 bucket_id='chat-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.is_active_user())
 and exists(select 1 from public.attachments a where a.path=objects.name and a.user_id=(select auth.uid()))
);

-- Owner maintenance after a crashed stream (also performed by the next quota reservation).
-- update public.messages set status='error' where status='pending' and created_at<now()-interval '2 minutes';
