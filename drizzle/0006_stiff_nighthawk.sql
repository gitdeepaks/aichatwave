CREATE TYPE "public"."memory_consent" AS ENUM('granted', 'declined');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "memory_consent" "memory_consent";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "memory_consent_at" timestamp with time zone;