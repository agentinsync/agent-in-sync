-- Add origin_organization_id to issues (tracks where a shared issue came from)
ALTER TABLE "issues" ADD COLUMN "origin_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_origin_organization_id_organizations_id_fk" FOREIGN KEY ("origin_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Add 'revoked' to share_status enum
ALTER TYPE "public"."share_status" ADD VALUE 'revoked';--> statement-breakpoint

-- Make origin_issue_id nullable in shared_content (deprecated, kept for migration compatibility)
ALTER TABLE "shared_content" ALTER COLUMN "origin_issue_id" DROP NOT NULL;--> statement-breakpoint

-- Add revoked_at to shared_content
ALTER TABLE "shared_content" ADD COLUMN "revoked_at" timestamp;
