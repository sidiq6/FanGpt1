# Laporan verifikasi FanGpt

Tanggal: 23 Oktober 2026.

## Hasil yang diverifikasi

- Pemeriksaan TypeScript: lulus.
- Build publikasi Vinext/Worker: lulus.
- Build produksi Next.js standar: lulus.
- Enam tes otomatis: lulus.
- Gemini langsung: streaming teks berhasil; permintaan singkat menghasilkan penanda FANGPT_OK.
- Gemini langsung: analisis gambar sintetis berhasil mengidentifikasi latar merah dan tulisan putih.
- Browser desktop: beranda, kartu prompt yang mengisi kolom pesan, mode gelap, halaman admin, dan status login belum aktif telah diperiksa.
- API riwayat dan admin menolak pembacaan tanpa sesi akun.

## Enam kelompok tes otomatis

1. Menolak format unggahan palsu, MIME yang tidak sesuai, SVG tersamar dan gambar melebihi batas ukuran.
2. Memvalidasi ID pesan, pesan kosong, panjang input dan pemotongan konteks.
3. Memblokir callback yang mengarah ke origin lain.
4. Mencegah secret key/service-role key Supabase masuk konfigurasi publik.
5. Membaca stream SSE dengan UTF-8 dan delimiter CRLF yang terpotong sampai per byte.
6. Mengeksekusi migrasi di PostgreSQL lokal (PGlite): isolasi antar pemilik, larangan menulis peran/kuota sendiri, perlindungan gambar privat, pemblokiran akun nonaktif, hak fungsi server, dan batas permintaan per menit/hari.

## Batas verifikasi

Proyek Supabase nyata belum dihubungkan. Karena itu pendaftaran, login Google, pengiriman email verifikasi/reset, persistensi lintas perangkat, unggahan Storage nyata, dan dashboard dengan data akun nyata belum diuji end-to-end. Kode dan migrasi tersedia, tetapi konfigurasi eksternal ini belum aktif.

Pengujian browser dilakukan pada desktop. Layout responsif tersedia melalui CSS, tetapi perangkat Android/iOS fisik belum diuji. Tidak ada pengujian beban publik.

Batas percobaan privat tanpa Supabase memakai memori instance; aktifkan layanan akun sebelum publikasi umum. Respons model AI bersifat generatif sehingga kebenaran seluruh jawaban tidak dijamin oleh tes koneksi.
