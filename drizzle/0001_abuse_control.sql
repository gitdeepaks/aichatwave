CREATE TABLE "usage_counter" (
	"user_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counter_user_id_period_start_pk" PRIMARY KEY("user_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start")
);
--> statement-breakpoint
CREATE TABLE "stream_lease" (
	"owner_key" text NOT NULL,
	"slot" integer NOT NULL,
	"lease_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stream_lease_owner_key_slot_pk" PRIMARY KEY("owner_key","slot")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "billing_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_counter" ADD CONSTRAINT "usage_counter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_window_start_idx" ON "rate_limit_bucket" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "stream_lease_expires_at_idx" ON "stream_lease" USING btree ("expires_at");