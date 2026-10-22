import { lt, sql } from "drizzle-orm";
import { db } from "./index.js";
import { orders, orderCounters } from "./schema.js";

// Pesanan direset setiap hari pada pukul 00:00 WIB (Asia/Jakarta, UTC+7).
// Ubah konstanta ini bila zona waktu toko berbeda (jadwal cron di vercel.json ikut disesuaikan).
export const SHOP_TIME_ZONE = "Asia/Jakarta";

// Awal "hari ini" menurut zona waktu toko, sebagai timestamptz (dihitung oleh database).
export const startOfTodaySql = sql`(date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')`;

// Tanggal "hari ini" menurut zona waktu toko, sebagai date (dihitung oleh database).
const todayDateSql = sql`(now() AT TIME ZONE 'Asia/Jakarta')::date`;

// Kunci hari (YYYY-MM-DD) menurut WIB, dipakai agar reset hanya dicoba sekali per hari per instance.
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

let lastPurgedDay = "";

/**
 * Menghapus semua pesanan dari hari-hari sebelumnya (sebelum 00:00 WIB hari ini)
 * beserta penghitung nomor lamanya. Aman dipanggil berulang kali (idempoten): yang dihapus
 * hanyalah data yang memang sudah lewat batas reset.
 *
 * Tanpa `force`, pembersihan hanya dijalankan sekali per hari per instance, sehingga bisa dipanggil
 * di setiap request tanpa membebani database. Cron di vercel.json memanggilnya dengan `force`.
 */
export async function purgeStaleOrders(force = false): Promise<{ deletedOrders: number } | null> {
  const key = todayKey();
  if (!force && lastPurgedDay === key) return null;

  const deleted = await db
    .delete(orders)
    .where(lt(orders.createdAt, startOfTodaySql))
    .returning({ id: orders.id });

  await db.delete(orderCounters).where(lt(orderCounters.day, todayDateSql));

  lastPurgedDay = key;
  return { deletedOrders: deleted.length };
}

/**
 * Mengambil nomor pesanan berikutnya untuk hari ini (1, 2, 3, ...).
 * Satu perintah INSERT ... ON CONFLICT DO UPDATE bersifat atomik, sehingga dua pembeli yang
 * memesan bersamaan tidak akan pernah mendapat nomor yang sama.
 */
export async function nextOrderNumber(): Promise<string> {
  const [row] = await db
    .insert(orderCounters)
    .values({ day: todayDateSql as unknown as string, lastNumber: 1 })
    .onConflictDoUpdate({
      target: orderCounters.day,
      set: { lastNumber: sql`${orderCounters.lastNumber} + 1` },
    })
    .returning({ n: orderCounters.lastNumber });

  return String(row.n);
}
