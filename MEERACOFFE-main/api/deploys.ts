import { desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { ensureSchema } from "../db/ensure.js";
import {
  DEPLOY_ENVIRONMENTS,
  DEPLOY_STATUSES,
  deploys,
  type DeployEnvironment,
  type DeployStatus,
} from "../db/schema.js";

// GET  /api/deploys -> riwayat deploy + ringkasan + info deployment yang sedang berjalan
// POST /api/deploys -> catat deploy secara manual (form "Catat Deploy" di menu admin)

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

// Info deployment yang sedang menjalankan fungsi ini (variabel sistem Vercel).
// Saat dijalankan lokal, isVercel = false.
function currentDeployment() {
  const env = process.env;
  const sha = env.VERCEL_GIT_COMMIT_SHA || null;
  return {
    isVercel: Boolean(env.VERCEL || env.VERCEL_DEPLOYMENT_ID),
    environment: env.VERCEL_ENV || "local",
    region: env.VERCEL_REGION || null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID || null,
    url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commitSha: sha,
    commitMessage: env.VERCEL_GIT_COMMIT_MESSAGE || null,
    author: env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || null,
    nodeVersion: process.version,
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function handler(req: Request): Promise<Response> {
  const headers = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method === "GET") {
    try {
      await ensureSchema();
      const rows = await db
        .select()
        .from(deploys)
        .orderBy(desc(deploys.createdAt), desc(deploys.id))
        .limit(500);

      const success = rows.filter((d) => d.status === "Berhasil");
      const failed = rows.filter((d) => d.status === "Gagal");
      const production = rows.filter((d) => d.environment === "Production");

      return Response.json(
        {
          deploys: rows,
          summary: {
            totalDeploys: rows.length,
            successCount: success.length,
            failedCount: failed.length,
            productionCount: production.length,
            lastDeployAt: rows[0]?.createdAt ?? null,
            lastDeployVersion: rows[0]?.version ?? null,
            lastSuccessAt: success[0]?.createdAt ?? null,
          },
          current: currentDeployment(),
          serverTime: new Date().toISOString(),
        },
        { status: 200, headers }
      );
    } catch (error) {
      console.error("Error fetching deploys:", error);
      return Response.json(
        { error: "Gagal memuat riwayat deploy dari database." },
        { status: 500, headers }
      );
    }
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Format data deploy tidak valid." }, { status: 400, headers });
    }

    const version = cleanText(body.version, 40);
    if (!version) {
      return Response.json({ error: "Versi / nama rilis wajib diisi." }, { status: 400, headers });
    }

    const environment = (cleanText(body.environment, 20) || "Production") as DeployEnvironment;
    if (!DEPLOY_ENVIRONMENTS.includes(environment)) {
      return Response.json(
        { error: `Lingkungan tidak valid. Pilih: ${DEPLOY_ENVIRONMENTS.join(", ")}.` },
        { status: 400, headers }
      );
    }

    const status = (cleanText(body.status, 20) || "Berhasil") as DeployStatus;
    if (!DEPLOY_STATUSES.includes(status)) {
      return Response.json(
        { error: `Status tidak valid. Pilih: ${DEPLOY_STATUSES.join(", ")}.` },
        { status: 400, headers }
      );
    }

    const url = cleanText(body.url, 300) || null;
    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: "URL harus diawali http:// atau https://." },
        { status: 400, headers }
      );
    }

    let durationSeconds: number | null = null;
    if (body.durationSeconds !== undefined && body.durationSeconds !== null && body.durationSeconds !== "") {
      const n = Number(body.durationSeconds);
      if (!Number.isInteger(n) || n < 0 || n > 86400) {
        return Response.json(
          { error: "Durasi harus berupa bilangan bulat detik (0 – 86400)." },
          { status: 400, headers }
        );
      }
      durationSeconds = n;
    }

    try {
      await ensureSchema();
      const [created] = await db
        .insert(deploys)
        .values({
          version,
          environment,
          status,
          branch: cleanText(body.branch, 100) || "main",
          commitMessage: cleanText(body.commitMessage, 300) || "-",
          deployedBy: cleanText(body.deployedBy, 100) || "-",
          url,
          durationSeconds,
          source: "manual",
        })
        .returning();

      return Response.json(
        { success: true, message: `Deploy ${created.version} berhasil dicatat.`, deploy: created },
        { status: 201, headers }
      );
    } catch (error) {
      console.error("Error inserting deploy:", error);
      return Response.json({ error: "Gagal menyimpan data deploy." }, { status: 500, headers });
    }
  }

  return Response.json({ error: "Metode HTTP tidak diizinkan." }, { status: 405, headers });
}

export { handler as GET, handler as POST, handler as OPTIONS };
