CREATE TYPE "public"."source_ref_type" AS ENUM('raw_source', 'issue', 'solution', 'wiki_page');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('documentation', 'meeting_notes', 'slack_thread', 'article', 'architecture', 'runbook', 'other');--> statement-breakpoint
CREATE TYPE "public"."wiki_operation" AS ENUM('ingest', 'page_created', 'page_updated', 'page_linked', 'lint_pass', 'contradiction');--> statement-breakpoint
CREATE TABLE "raw_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_agent_id" uuid,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_url" text,
	"content_hash" text,
	"project" varchar(200),
	"tech_stack" text[],
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"query" text NOT NULL,
	"result_count" integer NOT NULL,
	"search_type" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"operation" "wiki_operation" NOT NULL,
	"agent_id" uuid,
	"summary" text NOT NULL,
	"related_page_ids" uuid[],
	"related_source_ids" uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wiki_page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"tags" text[],
	"edited_by_user_id" uuid NOT NULL,
	"edited_by_agent_id" uuid,
	"edit_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_page_id" uuid NOT NULL,
	"target_page_id" uuid NOT NULL,
	"relationship" varchar(50) DEFAULT 'related' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wiki_page_id" uuid NOT NULL,
	"source_type" "source_ref_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wiki_page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"agent_id" uuid,
	"direction" "vote_direction" NOT NULL,
	"context" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"last_edited_by_agent_id" uuid,
	"slug" varchar(200) NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'approved' NOT NULL,
	"project" varchar(200),
	"tech_stack" text[],
	"last_linted_at" timestamp,
	"weaviate_indexed_at" timestamp,
	"search_vector" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "settings" jsonb;--> statement-breakpoint
ALTER TABLE "raw_sources" ADD CONSTRAINT "raw_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_sources" ADD CONSTRAINT "raw_sources_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_sources" ADD CONSTRAINT "raw_sources_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "search_events" ADD CONSTRAINT "search_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "wiki_log" ADD CONSTRAINT "wiki_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_log" ADD CONSTRAINT "wiki_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_history" ADD CONSTRAINT "wiki_page_history_wiki_page_id_wiki_pages_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_history" ADD CONSTRAINT "wiki_page_history_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_history" ADD CONSTRAINT "wiki_page_history_edited_by_agent_id_agents_id_fk" FOREIGN KEY ("edited_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_links" ADD CONSTRAINT "wiki_page_links_source_page_id_wiki_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_links" ADD CONSTRAINT "wiki_page_links_target_page_id_wiki_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_sources" ADD CONSTRAINT "wiki_page_sources_wiki_page_id_wiki_pages_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_votes" ADD CONSTRAINT "wiki_page_votes_wiki_page_id_wiki_pages_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_votes" ADD CONSTRAINT "wiki_page_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_votes" ADD CONSTRAINT "wiki_page_votes_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_votes" ADD CONSTRAINT "wiki_page_votes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_last_edited_by_agent_id_agents_id_fk" FOREIGN KEY ("last_edited_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_sources_org_idx" ON "raw_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "raw_sources_hash_idx" ON "raw_sources" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_sources_type_idx" ON "raw_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_events_org_results_idx" ON "search_events" USING btree ("organization_id","result_count","created_at");--> statement-breakpoint
CREATE INDEX "wiki_log_org_idx" ON "wiki_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wiki_log_created_at_idx" ON "wiki_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wiki_log_operation_idx" ON "wiki_log" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "wiki_page_history_page_idx" ON "wiki_page_history" USING btree ("wiki_page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_history_version_idx" ON "wiki_page_history" USING btree ("wiki_page_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_links_unique" ON "wiki_page_links" USING btree ("source_page_id","target_page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_links_target_idx" ON "wiki_page_links" USING btree ("target_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_sources_unique" ON "wiki_page_sources" USING btree ("wiki_page_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "wiki_page_sources_page_idx" ON "wiki_page_sources" USING btree ("wiki_page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_sources_source_idx" ON "wiki_page_sources" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_votes_page_user_idx" ON "wiki_page_votes" USING btree ("wiki_page_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_pages_org_slug_idx" ON "wiki_pages" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "wiki_pages_org_idx" ON "wiki_pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_vote_count_idx" ON "wiki_pages" USING btree ("vote_count");--> statement-breakpoint
CREATE INDEX "wiki_pages_updated_at_idx" ON "wiki_pages" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "wiki_pages_project_idx" ON "wiki_pages" USING btree ("project");