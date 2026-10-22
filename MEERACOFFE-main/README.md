# Meera Coffee — Sistem Pemesanan Pembeli & Dashboard Admin (Vercel)

Dua antarmuka terpisah yang berbagi satu backend dan database Postgres, siap di-deploy di **Vercel**:

1. **Website Pembeli** (`public/index.html`, `public/styles.css`, `public/script.js`) — katalog menu, keranjang, dan formulir pemesanan. Pesanan dikirim ke `POST /api/orders`.
2. **Dashboard Admin** (`public/admin/`) — **langsung terbuka tanpa login** di `/admin/`. Menu:
   - **Pesanan Masuk** — antrean pesanan real-time, alur status (`Baru` → `Diproses` → `Siap Diambil` → `Selesai`), notifikasi, filter.
   - **Riwayat & Penjualan** — riwayat transaksi, ringkasan omzet, menu terlaris, ekspor CSV.
   - **Deploys** — riwayat rilis website (versi, lingkungan, status, commit), info deployment yang sedang berjalan, dan form **Catat Deploy**.
3. **Backend (Vercel Functions)**
   - `api/orders.ts` (`/api/orders`, `/api/orders/:id`) — simpan pesanan pembeli (harga divalidasi di server), baca daftar pesanan, ubah status.
   - `api/reset.ts` (`/api/reset`) — reset harian data pesanan (dipanggil Vercel Cron, lihat bagian *Nomor Pesanan & Reset Harian*).
   - `api/deploys.ts` (`/api/deploys`) — baca riwayat deploy + ringkasan, dan catat deploy manual.
   - `db/` — skema Drizzle ORM + koneksi Neon Postgres. `db/ensure.ts` membuat/memigrasi tabel secara otomatis, `db/daily.ts` berisi nomor pesanan harian & reset. `drizzle/` berisi migrasi SQL.

> ⚠️ **Dashboard admin tidak memakai login.** Siapa pun yang mengetahui alamat `/admin/` (dan `/api/orders`) dapat melihat pesanan beserta nama pembeli dan mengubah statusnya. Jangan membagikan alamat admin ke pelanggan. Jika nanti perlu pengamanan, login atau PIN sederhana bisa ditambahkan kembali.

## Alur Pesanan → Admin

1. Pembeli memilih menu di `/` lalu menekan **Konfirmasi Pesanan**.
2. Browser mengirim `POST /api/orders`; server memvalidasi menu & harga lalu menyimpannya ke tabel `orders`.
3. Dashboard admin membaca `GET /api/orders` setiap ±3,5 detik (dan seketika bila admin & pembeli terbuka di browser yang sama), lalu menampilkan kartu pesanan, banner, dan nada notifikasi — tanpa perlu memuat ulang halaman.

## Nomor Pesanan & Reset Harian

- **Nomor pesanan = urutan pesanan pada hari itu**: pesanan pertama hari ini bernomor `#1`, lalu `#2`, `#3`, dst. Nomor dibagikan secara atomik oleh server (tabel `order_counters`), sehingga dua pembeli yang memesan bersamaan tidak pernah mendapat nomor yang sama.
- **Data pesanan direset setiap hari pukul 00:00 WIB** (zona waktu `Asia/Jakarta`): semua pesanan sebelum hari ini dihapus, dan nomor kembali mulai dari `#1`. Reset dijalankan dua cara sekaligus:
  1. **Vercel Cron** — `vercel.json` memanggil `/api/reset` setiap hari pukul `17:00 UTC` (= 00:00 WIB). Pada paket Hobby, Vercel menjalankan cron harian kapan saja dalam jam yang dijadwalkan.
  2. **Otomatis saat ada request** — `/api/orders` menjalankan pembersihan yang sama pada request pertama setiap hari, jadi data tetap ter-reset tepat setelah tengah malam walau cron terlambat.
- `/api/reset` aman tanpa login: ia hanya menghapus pesanan **sebelum 00:00 WIB hari ini** dan tidak pernah menyentuh pesanan hari ini.
- ⚠️ Karena riwayat dihapus tiap hari, laporan **Riwayat & Penjualan** hanya berisi data hari ini. Unduh **Laporan CSV** sebelum tengah malam bila perlu menyimpannya.
- Zona waktu diatur di `db/daily.ts` (`SHOP_TIME_ZONE` dan dua ekspresi `'Asia/Jakarta'`); bila diganti, sesuaikan juga jadwal `crons` di `vercel.json`.
- Kolom **Catatan** (sebelumnya "Nomor Meja") diisi pembeli lewat kolom *Catatan (Opsional)* di keranjang.

## Harga Menu

Harga di dashboard admin berasal dari **server**, bukan dari browser pembeli. Daftar harga resmi ada di `MENU_CATALOG` pada `api/orders.ts` dan **harus sama** dengan harga di `public/index.html`. Bila harga menu diubah, ubah di kedua tempat tersebut. Pesanan yang sudah tersimpan tetap memakai harga saat dipesan.

## Menu Deploys

Menu **Deploys** menampilkan tabel `deploys`. Barisnya berasal dari tiga sumber:

| Sumber | Keterangan |
| --- | --- |
| **Vercel (otomatis)** | Setiap deployment baru di Vercel tercatat sekali (versi = 7 karakter commit, plus branch, pesan commit, penulis, dan URL) saat deployment itu menerima permintaan API pertamanya — mis. admin membuka dashboard atau pembeli mengirim pesanan. Memakai variabel sistem Vercel (`VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_*`, `VERCEL_ENV`, dll.); pastikan **Settings → Environment Variables → "Automatically expose System Environment Variables"** aktif (bawaan Vercel). |
| **Manual** | Tombol **Catat Deploy** di menu Deploys (versi, lingkungan, status, branch, catatan, dirilis oleh, durasi, URL). |
| **Data Awal** | 4 contoh riwayat rilis (v1.0.0 – v1.3.0) yang diisi sekali saat tabel masih kosong, supaya menu langsung terlihat berisi. Hapus lewat SQL Editor bila tidak diperlukan: `DELETE FROM deploys WHERE source = 'seed';` |

Kartu **Deployment Aktif** di bagian atas menampilkan lingkungan, region, branch, commit, dan URL deployment yang sedang melayani halaman (saat dijalankan lokal tampil sebagai "Lokal").

---

## Deploy ke Vercel

1. **Upload proyek** ke GitHub, lalu di Vercel pilih **Add New → Project** dan impor repositori. Framework preset: **Other** (tidak perlu build command; `vercel.json` sudah mengatur folder `public`).
2. **Buat database:** di proyek Vercel buka **Storage → Create Database → Neon (Postgres)** lalu hubungkan ke proyek. `DATABASE_URL` akan terisi otomatis.
3. **Deploy ulang** agar `DATABASE_URL` terbaca. Tidak ada kata sandi atau variabel lain yang wajib diisi. Setelah itu:
   - Website pembeli: `https://<proyek>.vercel.app/`
   - Dashboard admin: `https://<proyek>.vercel.app/admin/`

Tabel `orders`, `order_counters`, dan `deploys` dibuat **otomatis** pada permintaan pertama, jadi tidak perlu migrasi manual. Bila lebih suka membuatnya sendiri, pilih salah satu:
- Buka Neon SQL Editor, tempel isi `db/init.sql`, lalu jalankan; atau
- Dari komputer, isi `.env`, lalu jalankan `npm install` dan `npm run db:migrate`.

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env     # lalu isi DATABASE_URL (database Neon)
npx vercel dev           # http://localhost:3000
```

- Pembeli: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin/`

## Domain Terpisah (Opsional)

Jika halaman admin atau pembeli di-host di domain berbeda dari backend, set URL backend sebelum memuat skrip:
- `public/index.html`: `window.MEERA_API_BASE_URL = "https://meeracoffe-orders.vercel.app"` sebelum `<script src="script.js">`.
- `public/admin/index.html`: baris yang sama sebelum `<script src="admin.js">`.

Endpoint backend mengizinkan CORS dari domain mana pun.

## Struktur Singkat

```
api/orders.ts      pesanan (pembeli kirim, admin baca & ubah status)
api/reset.ts       reset harian pesanan (Vercel Cron)
api/deploys.ts     riwayat deploy
db/schema.ts       tabel orders, order_counters & deploys (Drizzle)
db/daily.ts        nomor pesanan harian & reset harian
db/ensure.ts       buat tabel otomatis, isi data awal, catat deployment Vercel
db/init.sql        SQL manual (opsional)
drizzle/           migrasi SQL (opsional)
public/            website pembeli
public/admin/      dashboard admin (tanpa login)
```
