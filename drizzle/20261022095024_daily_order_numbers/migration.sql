CREATE TABLE "order_counters" (
	"day" date PRIMARY KEY,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_number_key";