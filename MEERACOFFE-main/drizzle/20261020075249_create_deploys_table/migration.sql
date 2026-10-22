CREATE TABLE "deploys" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
