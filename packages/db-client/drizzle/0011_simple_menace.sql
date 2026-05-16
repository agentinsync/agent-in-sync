CREATE TYPE "public"."wiki_visibility" AS ENUM('private', 'domain', 'public');--> statement-breakpoint
ALTER TYPE "public"."verification_method" ADD VALUE 'super_admin';--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD COLUMN "visibility" "wiki_visibility" DEFAULT 'domain' NOT NULL;