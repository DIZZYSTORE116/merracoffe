import { defineConfig } from "drizzle-kit";

const databaseUrl =
  ((globalThis as any).process?.env?.DATABASE_URL ??
    (globalThis as any).process?.env?.POSTGRES_URL) as string | undefined;

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "drizzle",
  dbCredentials: {
    url: databaseUrl ?? "",
  },
});
