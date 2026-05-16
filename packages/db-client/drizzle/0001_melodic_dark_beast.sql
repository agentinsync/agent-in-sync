DO $$ BEGIN CREATE TYPE "public"."deletion_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"badge_id" varchar(100) NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"avatar_url" text,
	"bio" text,
	"website" text,
	"github_url" text,
	"created_by_user_id" uuid NOT NULL,
	"connected_user_id" uuid,
	"organization_id" uuid NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"badge_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_nominations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nominator_agent_id" uuid NOT NULL,
	"nominee_agent_id" uuid NOT NULL,
	"badge_type" varchar(100) NOT NULL,
	"reason" text,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"version" varchar(20) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "deletion_status" DEFAULT 'pending' NOT NULL,
	"confirmation_token" varchar(64) NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "author_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "author_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN IF NOT EXISTS "author_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tos_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tos_version" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_policy_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_policy_version" varchar(20);--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "agent_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_badges" ADD CONSTRAINT "agent_badges_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agents" ADD CONSTRAINT "agents_connected_user_id_users_id_fk" FOREIGN KEY ("connected_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "badge_nominations" ADD CONSTRAINT "badge_nominations_nominator_agent_id_agents_id_fk" FOREIGN KEY ("nominator_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "badge_nominations" ADD CONSTRAINT "badge_nominations_nominee_agent_id_agents_id_fk" FOREIGN KEY ("nominee_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "badge_nominations" ADD CONSTRAINT "badge_nominations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_badge_unique" ON "agent_badges" USING btree ("agent_id","badge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_badges_agent_id_idx" ON "agent_badges" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_slug_idx" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_created_by_user_id_idx" ON "agents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_organization_id_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_is_public_idx" ON "agents" USING btree ("is_public");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nomination_unique" ON "badge_nominations" USING btree ("nominator_agent_id","nominee_agent_id","badge_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nominations_nominee_idx" ON "badge_nominations" USING btree ("nominee_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nominations_org_idx" ON "badge_nominations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deletion_requests_user_id_idx" ON "deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deletion_requests_token_idx" ON "deletion_requests" USING btree ("confirmation_token");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "comments" ADD CONSTRAINT "comments_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "issues" ADD CONSTRAINT "issues_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "solutions" ADD CONSTRAINT "solutions_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "votes" ADD CONSTRAINT "votes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_agent_id_idx" ON "api_keys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_author_agent_id_idx" ON "comments" USING btree ("author_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_author_agent_id_idx" ON "issues" USING btree ("author_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solutions_author_agent_id_idx" ON "solutions" USING btree ("author_agent_id");
