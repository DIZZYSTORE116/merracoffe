import { ensureSchema } from "../db/ensure.js";
import { purgeStaleOrders } from "../db/daily.js";

// Reset harian pesanan. Dipanggil otomatis oleh Vercel Cron (lihat "crons" di vercel.json)
// setiap hari pukul 00:00 WIB. Selain itu, /api/orders juga menjalankan pembersihan yang sama
// pada request pertama setiap hari, sehingga data tetap ter-reset walau cron terlambat.
//
// Endpoint ini sengaja tanpa login: ia hanya menghapus pesanan SEBELUM 00:00 WIB hari ini
// (data yang memang sudah lewat batas reset), jadi memanggilnya kapan pun tidak berbahaya
// dan tidak pernah menghapus pesanan hari ini.

function headers(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers() });
  }

  try {
    await ensureSchema();
    const result = await purgeStaleOrders(true);
    return Response.json(
      {
        success: true,
        message: "Pesanan hari-hari sebelumnya telah direset.",
        deletedOrders: result?.deletedOrders ?? 0,
        serverTime: new Date().toISOString(),
      },
      { status: 200, headers: headers() }
    );
  } catch (error) {
    console.error("Error resetting orders:", error);
    return Response.json(
      { error: "Gagal mereset data pesanan." },
      { status: 500, headers: headers() }
    );
  }
}

export { handler as GET, handler as POST, handler as OPTIONS };
