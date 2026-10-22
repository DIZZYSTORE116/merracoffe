CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"order_number" text NOT NULL UNIQUE,
	"customer_name" text NOT NULL,
	"table_note" text DEFAULT '-' NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" integer NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'Baru' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
