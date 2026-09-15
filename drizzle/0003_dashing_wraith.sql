CREATE TABLE "account_deletion" (
	"user_id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
