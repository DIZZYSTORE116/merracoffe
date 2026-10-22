-- Jalankan sekali di Neon SQL Editor (alternatif dari "npm run db:migrate").
-- Catatan: langkah ini OPSIONAL. Server otomatis membuat kedua tabel ini (dan mengisi data awal deploys)
-- pada permintaan pertama, selama DATABASE_URL sudah terisi.

CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"table_note" text DEFAULT '-' NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" integer NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'Baru' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

-- Nomor pesanan = urutan pesanan pada hari itu (WIB) dan mulai lagi dari 1 setiap hari, jadi tidak unik global.
-- Bila tabel orders sudah ada dari versi lama, hapus constraint unik lamanya:
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_number_key";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_number_unique";

-- Penghitung nomor pesanan per hari (satu baris per hari).
CREATE TABLE IF NOT EXISTS "order_counters" (
	"day" date PRIMARY KEY,
	"last_number" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "deploys" (
	"id" serial PRIMARY KEY,
	"deployment_id" text UNIQUE,
	"version" text NOT NULL,
	"environment" text DEFAULT 'Production' NOT NULL,
	"status" text DEFAULT 'Berhasil' NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"commit_sha" text,
	"commit_message" text DEFAULT '-' NOT NULL,
	"deployed_by" text DEFAULT '-' NOT NULL,
	"url" text,
	"duration_seconds" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);

-- Data awal deploys (contoh bawaan; tampil sebagai "Data Awal" di menu Deploys).
INSERT INTO "deploys"
	("deployment_id", "version", "environment", "status", "branch", "commit_message", "deployed_by", "duration_seconds", "source", "created_at")
VALUES
	('seed-v1.0.0', 'v1.0.0', 'Production', 'Berhasil', 'main', 'Rilis awal: katalog menu pembeli, keranjang, dan form pemesanan', 'Tim Meera Coffee', 41, 'seed', now() - interval '3 days'),
	('seed-v1.1.0', 'v1.1.0', 'Production', 'Berhasil', 'main', 'Dashboard admin: antrean pesanan real-time dan alur status barista', 'Tim Meera Coffee', 38, 'seed', now() - interval '2 days'),
	('seed-v1.2.0', 'v1.2.0', 'Production', 'Berhasil', 'main', 'Riwayat transaksi, laporan penjualan, dan ekspor CSV', 'Tim Meera Coffee', 44, 'seed', now() - interval '1 day'),
	('seed-v1.3.0', 'v1.3.0', 'Production', 'Berhasil', 'main', 'Admin tanpa login dan menu Deploys', 'Tim Meera Coffee', 36, 'seed', now())
ON CONFLICT ("deployment_id") DO NOTHING;
