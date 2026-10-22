import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Vercel + Neon (Storage > Neon) otomatis mengisi DATABASE_URL / POSTGRES_URL.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL belum diatur. Hubungkan database Neon di Vercel (Storage) atau isi DATABASE_URL di file .env."
  );
}

// drizzle-orm 1.0: klien Neon diberikan lewat opsi `client`
// (bentuk lama `drizzle(sql, { schema })` sudah tidak didukung dan membuat server error saat dimuat).
export const db = drizzle({ client: neon(connectionString) });
