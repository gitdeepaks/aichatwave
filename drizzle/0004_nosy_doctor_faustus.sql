CREATE TYPE "public"."chat_stream_state" AS ENUM('streaming', 'completed', 'aborted', 'failed');--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"data" "bytea" NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_stream" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" "chat_stream_state" DEFAULT 'streaming' NOT NULL,
	"model_id" text NOT NULL,
	"user_text" text NOT NULL,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_stream_chunk" (
	"stream_id" text NOT NULL,
	"seq" integer NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_stream_chunk_stream_id_seq_pk" PRIMARY KEY("stream_id","seq")
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_stream" ADD CONSTRAINT "chat_stream_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_stream" ADD CONSTRAINT "chat_stream_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_stream_chunk" ADD CONSTRAINT "chat_stream_chunk_stream_id_chat_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."chat_stream"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_user_created_idx" ON "attachment" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attachment_thread_idx" ON "attachment" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_stream_thread_live_idx" ON "chat_stream" USING btree ("thread_id","created_at" DESC NULLS LAST) WHERE "chat_stream"."state" = 'streaming';--> statement-breakpoint
CREATE INDEX "chat_stream_settled_at_idx" ON "chat_stream" USING btree ("settled_at");