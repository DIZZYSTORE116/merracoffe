import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { ensureSchema } from "../db/ensure.js";
import { nextOrderNumber, purgeStaleOrders, startOfTodaySql } from "../db/daily.js";
import { orders, type OrderItem } from "../db/schema.js";

// HARGA DI SINI HARUS SAMA dengan harga di halaman menu (public/index.html).
// Server memakai daftar ini sebagai harga resmi (harga dari browser diabaikan), jadi bila harga
// diubah di menu, ubah juga di sini agar dashboard admin ikut menampilkan harga yang sama.
const MENU_CATALOG: Record<
  string,
  { price: number; category: "coffee" | "non-coffee" }
> = {
  "Ice Americano": { price: 8000, category: "coffee" },
  "Ice Cappuccino": { price: 10000, category: "coffee" },
  "Ice Salted Caramel": { price: 12000, category: "coffee" },
  "Ice Coffee Gula Aren": { price: 10000, category: "coffee" },
  "Ice Hazelnut Latte": { price: 12000, category: "coffee" },
  "Ice Milk Coffee": { price: 10000, category: "coffee" },
  "Ice Pandan Latte": { price: 10000, category: "non-coffee" },
  "Ice Milo Shake": { price: 10000, category: "non-coffee" },
  "Ice Brown Regal": { price: 10000, category: "non-coffee" },
  "Ice Thai Milk Tea": { price: 10000, category: "non-coffee" },
  "Ice Matcha Latte": { price: 13000, category: "non-coffee" },
  "Ice Matcha Aren": { price: 13000, category: "non-coffee" },
};

const VALID_STATUSES = ["Baru", "Diproses", "Siap Diambil", "Selesai"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

const ALLOWED_PAYMENT_METHODS = [
  "QRIS",
  "Bayar Tunai di Kasir",
  "Transfer Virtual Account",
];

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

function normalizePaymentMethod(raw: string): string {
  const cleaned = raw.replace(/^[^\wA-Za-z]+/, "").trim();
  for (const method of ALLOWED_PAYMENT_METHODS) {
    if (cleaned.toLowerCase().includes(method.toLowerCase())) {
      return method;
    }
  }
  return cleaned || "QRIS";
}

async function handler(req: Request): Promise<Response> {
  const headers = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // 1. POST /api/orders - Public endpoint for customers to place an order with server-side price validation
  if (req.method === "POST") {
    let body: {
      customerName?: string;
      tableNote?: string;
      paymentMethod?: string;
      items?: Array<{ name?: string; qty?: number; price?: number }>;
    };

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Format data pesanan tidak valid." },
        { status: 400, headers }
      );
    }

    const customerName = (body.customerName || "").trim();
    if (!customerName) {
      return Response.json(
        { error: "Nama pembeli wajib diisi." },
        { status: 400, headers }
      );
    }
    if (customerName.length > 100) {
      return Response.json(
        { error: "Nama pembeli terlalu panjang (maksimal 100 karakter)." },
        { status: 400, headers }
      );
    }

    const tableNote = (body.tableNote || "-").trim().slice(0, 100) || "-";
    const paymentMethod = normalizePaymentMethod(body.paymentMethod || "QRIS");

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return Response.json(
        { error: "Daftar produk pesanan tidak boleh kosong." },
        { status: 400, headers }
      );
    }

    // Consolidate duplicate items & validate prices strictly on server
    const consolidatedMap = new Map<string, number>();
    for (const rawItem of body.items) {
      const itemName = (rawItem?.name || "").trim();
      const qty = Number(rawItem?.qty);

      if (!itemName || !MENU_CATALOG[itemName]) {
        return Response.json(
          { error: `Produk "${itemName || "Tidak dikenal"}" tidak terdaftar di katalog Meera Coffee.` },
          { status: 400, headers }
        );
      }

      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return Response.json(
          { error: `Jumlah untuk "${itemName}" tidak valid.` },
          { status: 400, headers }
        );
      }

      consolidatedMap.set(itemName, (consolidatedMap.get(itemName) || 0) + qty);
    }

    const validatedItems: OrderItem[] = [];
    let calculatedTotal = 0;

    for (const [name, qty] of consolidatedMap.entries()) {
      const catalogEntry = MENU_CATALOG[name];
      const authoritativePrice = catalogEntry.price;
      const subtotal = authoritativePrice * qty;
      validatedItems.push({
        name,
        price: authoritativePrice,
        qty,
        subtotal,
      });
      calculatedTotal += subtotal;
    }

    try {
      await ensureSchema();
      await purgeStaleOrders(); // reset harian: buang pesanan hari-hari sebelumnya
      // Nomor pesanan = urutan pesanan pada hari ini (1, 2, 3, ...), mulai lagi dari 1 tiap hari.
      const orderNumber = await nextOrderNumber();
      const [createdOrder] = await db
        .insert(orders)
        .values({
          orderNumber,
          customerName,
          tableNote,
          items: validatedItems,
          totalAmount: calculatedTotal,
          paymentMethod,
          status: "Baru",
        })
        .returning();

      return Response.json(
        {
          success: true,
          message: "Pesanan berhasil disimpan.",
          order: createdOrder,
        },
        { status: 201, headers }
      );
    } catch (error) {
      console.error("Error inserting order:", error);
      return Response.json(
        { error: "Gagal menyimpan pesanan ke database. Silakan coba lagi." },
        { status: 500, headers }
      );
    }
  }

  // 2. GET /api/orders - Daftar pesanan + ringkasan untuk dashboard admin (tanpa login)
  if (req.method === "GET") {
    try {
      await ensureSchema();
      await purgeStaleOrders(); // reset harian: buang pesanan hari-hari sebelumnya
      const allOrders = await db
        .select()
        .from(orders)
        .where(gte(orders.createdAt, startOfTodaySql))
        .orderBy(desc(orders.createdAt), desc(orders.id));

      let baruCount = 0;
      let diprosesCount = 0;
      let siapDiambilCount = 0;
      let selesaiCount = 0;
      let totalRevenue = 0;
      let completedRevenue = 0;

      for (const ord of allOrders) {
        totalRevenue += Number(ord.totalAmount || 0);
        if (ord.status === "Baru") baruCount++;
        else if (ord.status === "Diproses") diprosesCount++;
        else if (ord.status === "Siap Diambil") siapDiambilCount++;
        else if (ord.status === "Selesai") {
          selesaiCount++;
          completedRevenue += Number(ord.totalAmount || 0);
        }
      }

      return Response.json(
        {
          orders: allOrders,
          summary: {
            totalOrders: allOrders.length,
            baruCount,
            diprosesCount,
            siapDiambilCount,
            activeProcessingCount: diprosesCount + siapDiambilCount,
            selesaiCount,
            totalRevenue,
            completedRevenue,
          },
          serverTime: new Date().toISOString(),
        },
        { status: 200, headers }
      );
    } catch (error) {
      console.error("Error fetching orders:", error);
      return Response.json(
        { error: "Gagal memuat daftar pesanan dari database." },
        { status: 500, headers }
      );
    }
  }

  // 3. PATCH / PUT /api/orders - Ubah status pesanan dari dashboard admin (tanpa login)
  if (req.method === "PATCH" || req.method === "PUT") {
    let body: {
      id?: number | string;
      orderNumber?: string;
      status?: string;
    };

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Format data pembaruan status tidak valid." },
        { status: 400, headers }
      );
    }

    const targetStatus = (body.status || "").trim() as OrderStatus;
    if (!VALID_STATUSES.includes(targetStatus)) {
      return Response.json(
        {
          error: `Status tidak valid. Pilih salah satu dari: ${VALID_STATUSES.join(", ")}.`,
        },
        { status: 400, headers }
      );
    }

    // ID dari /api/orders/:id (di-rewrite oleh vercel.json menjadi ?id=) atau dari body
    const reqUrl = new URL(req.url);
    const pathId = reqUrl.pathname.match(/\/api\/orders\/([^/]+)\/?$/)?.[1];
    const paramId = reqUrl.searchParams.get("id") || pathId || body.id;
    const orderNumber = body.orderNumber;

    if (!paramId && !orderNumber) {
      return Response.json(
        { error: "ID pesanan atau nomor pesanan wajib disertakan." },
        { status: 400, headers }
      );
    }

    if (paramId && !Number.isInteger(Number(paramId))) {
      return Response.json({ error: "ID pesanan tidak valid." }, { status: 400, headers });
    }

    try {
      await ensureSchema();
      // Nomor pesanan berulang setiap hari, jadi pencarian lewat nomor dibatasi pada pesanan hari ini.
      const whereClause = paramId
        ? eq(orders.id, Number(paramId))
        : and(
            eq(orders.orderNumber, String(orderNumber)),
            gte(orders.createdAt, startOfTodaySql)
          );

      const [updatedOrder] = await db
        .update(orders)
        .set({
          status: targetStatus,
          updatedAt: new Date(),
        })
        .where(whereClause)
        .returning();

      if (!updatedOrder) {
        return Response.json(
          { error: "Pesanan tidak ditemukan." },
          { status: 404, headers }
        );
      }

      return Response.json(
        {
          success: true,
          message: `Status pesanan ${updatedOrder.orderNumber} diperbarui menjadi "${targetOrderStatusLabel(targetStatus)}".`,
          order: updatedOrder,
        },
        { status: 200, headers }
      );
    } catch (error) {
      console.error("Error updating order status:", error);
      return Response.json(
        { error: "Gagal memperbarui status pesanan." },
        { status: 500, headers }
      );
    }
  }

  return Response.json(
    { error: "Metode HTTP tidak diizinkan." },
    { status: 405, headers }
  );
}

function targetOrderStatusLabel(status: OrderStatus): string {
  if (status === "Baru") return "Pesanan Baru";
  return status;
}

export {
  handler as GET,
  handler as POST,
  handler as PATCH,
  handler as PUT,
  handler as OPTIONS,
};
