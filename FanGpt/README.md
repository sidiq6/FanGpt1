# FanGpt

Aplikasi chatbot dengan Gemini, percakapan teks, analisis gambar, riwayat, login Google/email, dan panel admin. Antarmuka berbahasa Indonesia, responsif, dengan mode terang dan gelap.

## Status penyerahan

- Gemini: koneksi model, jawaban streaming, dan analisis gambar telah diuji langsung menggunakan gambar sintetis.
- UI: beranda, kartu prompt, tema, pengaturan dan halaman admin tersedia.
- Supabase: kode autentikasi, API database, migrasi PostgreSQL, kebijakan RLS, storage privat, dan admin tersedia. Proyek Supabase belum dihubungkan karena akses ke akun tersebut tidak diberikan. Login Google/email dan sinkronisasi belum aktif pada publikasi awal.
- Mode percobaan pada Site privat (FANGPT_PRIVATE_PREVIEW=1, hanya diatur pada environment Site privat): pengguna yang sudah masuk melalui akses Site dapat mengirim pesan Gemini. Teks riwayat tersimpan di browser, sedangkan gambar berada dalam memori sesi. Mode ini tidak menyediakan sinkronisasi akun.
- Pengujian SQL lokal memakai PostgreSQL melalui PGlite; pengujian Google OAuth, pengiriman email dan Storage Supabase nyata harus dilakukan setelah konfigurasi proyek.

Kunci Gemini tidak menggantikan kredensial Supabase atau konfigurasi Google OAuth. Tidak ada kunci atau kata sandi yang disertakan dalam ZIP ini.

## Teknologi

Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/Storage, Gemini GenerateContent REST API dan Server-Sent Events. Runtime publikasi Site menggunakan Vinext yang kompatibel dengan pola Next.js; skrip Next.js standar juga tersedia untuk laptop dan Vercel.

## 1. Menjalankan di laptop

Pasang Node.js 22.13 atau lebih baru. Ekstrak proyek, lalu jalankan dari folder FanGpt:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
```

Salin `.env.example` menjadi `.env.local` dan isi variabel sesuai langkah berikut. Kemudian:

```sh
pnpm dev:next
```

Buka alamat localhost yang dicetak terminal, biasanya `http://localhost:3000`. HP dapat mengakses aplikasi yang sudah dihosting. Server aplikasi diperlukan; file ini tidak dijalankan dengan mengetuk HTML langsung.

Untuk build Next.js:

```sh
pnpm build:next
pnpm start:next
```

Alternatif jika Corepack tidak tersedia: gunakan npm untuk memasang dependensi dan `npm run dev:next`. Lockfile yang disertakan adalah `pnpm-lock.yaml`.

## 2. Mengaktifkan Gemini

Buat kunci pada Google AI Studio. Gunakan kunci baru apabila kunci sebelumnya pernah dibagikan. Isi `AI_API_KEY` pada environment server.

Endpoint default adalah `https://generativelanguage.googleapis.com/v1beta`; model default `gemini-3.5-flash-lite`. Kredensial dikirim ke origin resmi Google melalui header `x-goog-api-key`, bukan URL. Aplikasi menggunakan `streamGenerateContent` dan `inlineData` untuk gambar.

Aplikasi menampilkan kesalahan nyata jika kunci ditolak, model tidak tersedia, waktu menjawab habis, atau kuota habis. Tidak ada jawaban simulasi. Model tidak diberi alat pencarian web maupun pembuatan file.

## 3. Membuat database dan Storage

1. Buat proyek Supabase milikmu.
2. Buka SQL Editor. Jalankan isi `supabase/migrations/001_fangpt.sql` **sekali**. Jika menggunakan Supabase CLI, migrasi dapat diterapkan dengan alur `supabase db push` pada proyek yang sudah ditautkan.
3. Ambil Project URL dan **publishable key** dari konfigurasi API proyek. Masukkan sebagai `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`.
4. Masukkan secret key server sebagai `SUPABASE_SECRET_KEY`. Legacy service-role key dapat dipakai melalui `SUPABASE_SERVICE_ROLE_KEY`. Keduanya tidak boleh diletakkan di frontend atau variabel NEXT_PUBLIC.
5. Restart server atau deploy ulang setelah mengubah environment.

Migrasi membuat profil, percakapan, pesan, lampiran, penggunaan AI, reservasi kuota, dan daftar admin. Bucket `chat-images` bersifat privat. Tabel percakapan dan pesan memakai foreign key komposit untuk mencegah referensi antar pemilik.

Pengguna memiliki akses baca terhadap data miliknya dan hak terbatas untuk membuat/mengganti judul percakapan. Penulisan pesan, perubahan status akun, kuota, dan hak admin dilakukan melalui server setelah pemeriksaan identitas. Metadata profil dari formulir pendaftaran tidak menentukan hak admin.

## 4. Login Google dan email

Pada Supabase Authentication:

1. Aktifkan provider Email, konfirmasi email, serta Google.
2. Atur Site URL sesuai domain aplikasi.
3. Tambahkan redirect URL aplikasi: `https://DOMAIN-APLIKASI/auth/finish` dan `https://DOMAIN-APLIKASI/auth/finish?next=/account/reset`. Tambahkan juga versi localhost untuk pengembangan.
4. Di Google Cloud Console, buat OAuth client bertipe Web application. Konfigurasi consent screen dan pengguna penguji jika proyek masih dalam pengujian.
5. Gunakan **callback URL yang ditampilkan Supabase** sebagai Authorized redirect URI Google. URL ini berbeda dari callback aplikasi `/auth/finish`.
6. Masukkan OAuth Client ID dan Client Secret Google pada konfigurasi provider Google di Supabase.
7. Untuk penggunaan publik, konfigurasikan layanan email pengirim di Supabase dan uji verifikasi akun serta lupa kata sandi.

Alur aplikasi memakai PKCE. Tautan reset harus dibuka pada browser yang menyimpan verifier permintaan tersebut. Form reset memeriksa kesamaan kata sandi. Akses API memverifikasi access token melalui Supabase Auth, bukan mempercayai ID atau peran yang dikirim browser.

## 5. Menetapkan admin

Daftar/login dengan email yang sudah dikonfirmasi. Tetapkan email itu di `ADMIN_EMAILS` pada environment server, lalu restart/deploy ulang. Daftar ini dipisahkan dengan koma jika ada beberapa admin.

Alternatif untuk pengelola database: masukkan ID akun yang telah diverifikasi ke tabel `public.admin_users` lewat SQL Editor. Pengguna aplikasi biasa tidak memiliki akses tabel tersebut.

Buka `/admin`. Tidak ada akun, kata sandi, atau peningkatan hak admin otomatis untuk pendaftar pertama. Dashboard berisi statistik nyata, maksimal 100 akun terbaru, status/batas penggunaan, dan maksimal 1.000 kejadian layanan AI selama 7 hari terakhir. Log tidak memuat isi percakapan atau kunci API. Panel admin tidak menyediakan pembacaan percakapan pribadi pengguna.

## 6. Batas penggunaan dan pemeliharaan

- Maksimal 12.000 karakter per pesan, dua gambar per pesan, 4 MB per gambar.
- Gambar yang diterima: JPG, PNG, WebP; ukuran dan signature MIME diperiksa server.
- Konteks teks dibatasi 28.000 karakter / 24 pesan terbaru; maksimal dua gambar terdahulu diambil kembali pada percakapan cloud. Output dibatasi 4.096 token.
- Akun cloud: maksimal enam permintaan per menit dan 60 permintaan per hari (UTC) secara default. Admin dapat mengatur batas harian 0–500. Reservasi menggunakan kunci transaksi PostgreSQL agar konsisten antar instance.
- Percobaan privat tanpa Supabase: pembatasan 12 permintaan per jam per identitas pada memori instance. Ini bukan kuota global untuk layanan publik. Aktifkan Supabase sebelum membuka akses publik.
- Riwayat cloud dimuat bertahap, 100 pesan terbaru per halaman. Gunakan tombol tampilkan pesan sebelumnya untuk riwayat yang lebih lama.
- Jawaban yang dihentikan disimpan sebagai parsial jika runtime masih aktif. Jika worker terputus, pesan pending yang berusia lebih dari dua menit dipulihkan pada reservasi berikutnya.
- Penghapusan percakapan memberi tombstone, menghapus objek Storage, lalu menghapus row percakapan beserta pesan/lampiran. Jika Storage gagal, path dipertahankan untuk pembersihan ulang.

Jalankan pemeliharaan dari komputer tepercaya dengan environment server:

```sh
node --env-file=.env.local scripts/maintenance.mjs
```

Perintah ini membersihkan percakapan yang ditandai dihapus, unggahan terlepas lebih dari 24 jam, dan status jawaban yang tersangkut. Jangan menjalankannya dengan kredensial pengguna biasa.

## 7. Hosting

**Vercel:** impor folder sumber ke repository milikmu atau unggah dengan alur Vercel yang tersedia. Pilih framework Next.js, perintah install `pnpm install --frozen-lockfile`, dan perintah build `pnpm build:next`. Tambahkan environment dari `.env.example`, isi nilainya di dashboard hosting, lalu deploy. Lengkapi konfigurasi domain Supabase/Google sesuai URL final.

**Server Node.js:** jalankan build Next.js dan `pnpm start:next` di belakang reverse proxy HTTPS. Pastikan proxy mendukung streaming SSE dan timeout yang sesuai. Shared hosting yang hanya mendukung PHP/static tidak cukup untuk aplikasi ini.

**Sites:** sumber aslinya mempertahankan integrasi Vinext dan konfigurasi platform. `pnpm dev` dan `pnpm build` adalah jalur Vinext, sedangkan skrip berakhiran `:next` adalah jalur Next.js standar. Jangan memakai preview development sebagai server publik.

## 8. Pengujian

```sh
pnpm typecheck
pnpm test
pnpm build:next
```

Tes mencakup unggahan palsu/berukuran berlebih, pembatasan konteks, callback lintas origin, pencegahan paparan service key, fragmen SSE/UTF-8, serta eksekusi migrasi dengan uji RLS aktual di PostgreSQL lokal. Lihat `TEST_REPORT.md` untuk hasil dan batas verifikasi.

## Struktur utama

- `app/`: halaman chat, admin, callback/reset akun, dan API server.
- `components/fangpt/`: antarmuka chat, login, pengaturan dan admin.
- `lib/`: validasi, koneksi Gemini, autentikasi server, serta parser stream.
- `supabase/migrations/`: skema, hak akses, RLS dan bucket privat.
- `tests/`: tes keamanan dan database lokal.
- `scripts/maintenance.mjs`: pemulihan dan pembersihan data tertunda.
- `.env.example`: template konfigurasi tanpa kredensial.

## Referensi implementasi

- https://ai.google.dev/api
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://supabase.com/docs/guides/auth/quickstarts/nextjs
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Lisensi

Kode FanGpt dan logo SVG orisinal memakai MIT (`LICENSE`). Lisensi dependensi dan integrasi starter dicantumkan dalam `THIRD_PARTY_NOTICES.md` serta berkas lisensi vendor yang disertakan. Tidak ada foto, font berbayar, atau aset gambar pihak ketiga dalam aplikasi.
