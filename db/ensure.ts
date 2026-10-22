import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { deploys } from "./schema.js";

// Membuat tabel secara otomatis bila belum ada, sehingga website langsung berfungsi
// begitu DATABASE_URL terisi — tanpa perlu menjalankan migrasi manual lebih dulu.
// (db/init.sql dan folder drizzle/ tetap tersedia sebagai cara manual.)
// Dijalankan sekali per instance fungsi; semua perintah aman diulang (IF NOT EXISTS).

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = setup().catch((err) => {
      ready = null; // coba lagi di permintaan berikutnya
      throw err;
    });
  }
  return ready;
}

async function setup(): Promise<void> {
  await db.execute(sql`
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
    )
  `);

  // Nomor pesanan kini berupa urutan per hari ("1", "2", ...) dan mulai lagi dari 1 setiap hari,
  // jadi tidak boleh unik secara global. Database lama masih memiliki constraint unik tersebut
  // (namanya bergantung pada cara tabel dibuat), maka dihapus di sini. Aman diulang.
  await db.execute(sql`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_number_key"`);
  await db.execute(sql`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_number_unique"`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "order_counters" (
      "day" date PRIMARY KEY,
      "last_number" integer DEFAULT 0 NOT NULL
    )
  `);

  await db.execute(sql`
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
    )
  `);

  // Data awal hanya diisi bila tabel deploys masih kosong (berlaku juga bila tabel dibuat lewat migrasi).
  const anyDeploy = await db.select({ id: deploys.id }).from(deploys).limit(1);
  if (anyDeploy.length === 0) {
    await seedDeploys();
  }

  await recordCurrentVercelDeployment();
}

// Data awal contoh (ditandai source = 'seed' dan tampil sebagai "Data Awal" di admin).
async function seedDeploys(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "deploys"
      ("deployment_id", "version", "environment", "status", "branch", "commit_message", "deployed_by", "duration_seconds", "source", "created_at")
    VALUES
      ('seed-v1.0.0', 'v1.0.0', 'Production', 'Berhasil', 'main',
       'Rilis awal: katalog menu pembeli, keranjang, dan form pemesanan', 'Tim Meera Coffee', 41, 'seed', now() - interval '3 days'),
      ('seed-v1.1.0', 'v1.1.0', 'Production', 'Berhasil', 'main',
       'Dashboard admin: antrean pesanan real-time dan alur status barista', 'Tim Meera Coffee', 38, 'seed', now() - interval '2 days'),
      ('seed-v1.2.0', 'v1.2.0', 'Production', 'Berhasil', 'main',
       'Riwayat transaksi, laporan penjualan, dan ekspor CSV', 'Tim Meera Coffee', 44, 'seed', now() - interval '1 day'),
      ('seed-v1.3.0', 'v1.3.0', 'Production', 'Berhasil', 'main',
       'Admin tanpa login dan menu Deploys', 'Tim Meera Coffee', 36, 'seed', now())
    ON CONFLICT ("deployment_id") DO NOTHING
  `);
}

// Di Vercel, setiap deployment baru dicatat otomatis (sekali) dari variabel sistem Vercel.
let recordedDeploymentId: string | null = null;

async function recordCurrentVercelDeployment(): Promise<void> {
  const env = process.env;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  if (!deploymentId || recordedDeploymentId === deploymentId) return;

  const sha = env.VERCEL_GIT_COMMIT_SHA || null;
  const environment =
    env.VERCEL_ENV === "production"
      ? "Production"
      : env.VERCEL_ENV === "preview"
        ? "Preview"
        : "Development";
  const host = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null;

  await db
    .insert(deploys)
    .values({
      deploymentId,
      version: sha ? sha.slice(0, 7) : deploymentId.replace(/^dpl_/, "").slice(0, 9),
      environment,
      status: "Berhasil",
      branch: env.VERCEL_GIT_COMMIT_REF || "-",
      commitSha: sha,
      commitMessage: (env.VERCEL_GIT_COMMIT_MESSAGE || "Deploy dari Vercel").slice(0, 300),
      deployedBy: env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || env.VERCEL_GIT_REPO_OWNER || "Vercel",
      url: host,
      source: "vercel",
    })
    .onConflictDoNothing({ target: deploys.deploymentId });

  recordedDeploymentId = deploymentId;
}
