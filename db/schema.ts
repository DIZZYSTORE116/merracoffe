import { pgTable, serial, text, integer, timestamp, jsonb, date } from "drizzle-orm/pg-core";

export interface OrderItem {
  name: string;
  price: number;
  qty: number;
  subtotal: number;
}

// orderNumber = urutan pesanan pada hari itu ("1", "2", "3", ...). Angkanya mulai lagi dari 1
// setiap hari (zona waktu WIB), jadi TIDAK unik secara global. Nomor dibagikan secara atomik
// lewat tabel order_counters.
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  customerName: text("customer_name").notNull(),
  tableNote: text("table_note").notNull().default("-"),
  items: jsonb("items").$type<OrderItem[]>().notNull(),
  totalAmount: integer("total_amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull().default("Baru"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Penghitung nomor pesanan per hari (hari WIB). Satu baris per hari; baris hari lalu dihapus saat reset.
export const orderCounters = pgTable("order_counters", {
  day: date("day", { mode: "string" }).primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const DEPLOY_ENVIRONMENTS = ["Production", "Preview", "Development"] as const;
export const DEPLOY_STATUSES = ["Berhasil", "Sedang Berjalan", "Gagal", "Dibatalkan"] as const;
export const DEPLOY_SOURCES = ["vercel", "manual", "seed"] as const;

export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];
export type DeployStatus = (typeof DEPLOY_STATUSES)[number];
export type DeploySource = (typeof DEPLOY_SOURCES)[number];

// Riwayat rilis (deploy) website. Baris bisa berasal dari:
//   vercel -> dicatat otomatis saat deployment Vercel menerima permintaan pertama
//   manual -> dicatat lewat form "Catat Deploy" di menu admin
//   seed   -> data awal contoh bawaan
export const deploys = pgTable("deploys", {
  id: serial("id").primaryKey(),
  deploymentId: text("deployment_id").unique(),
  version: text("version").notNull(),
  environment: text("environment").$type<DeployEnvironment>().notNull().default("Production"),
  status: text("status").$type<DeployStatus>().notNull().default("Berhasil"),
  branch: text("branch").notNull().default("main"),
  commitSha: text("commit_sha"),
  commitMessage: text("commit_message").notNull().default("-"),
  deployedBy: text("deployed_by").notNull().default("-"),
  url: text("url"),
  durationSeconds: integer("duration_seconds"),
  source: text("source").$type<DeploySource>().notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
