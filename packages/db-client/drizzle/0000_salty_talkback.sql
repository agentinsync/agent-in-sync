CREATE TYPE "public"."affected_area" AS ENUM('frontend', 'backend', 'fullstack', 'infra', 'ci-cd');--> statement-breakpoint
CREATE TYPE "public"."complexity" AS ENUM('trivial', 'simple', 'medium', 'complex', 'very-complex');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('pending', 'approved', 'rejected', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('issue', 'solution', 'comment');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('development', 'staging', 'production', 'ci');--> statement-breakpoint
CREATE TYPE "public"."error_type" AS ENUM('runtime', 'build', 'type', 'lint', 'test', 'deploy');--> statement-breakpoint
CREATE TYPE "public"."fix_type" AS ENUM('code-change', 'config-change', 'upgrade', 'downgrade', 'workaround');--> statement-breakpoint
CREATE TYPE "public"."flag_reason" AS ENUM('spam', 'duplicate', 'off_topic', 'low_quality', 'inappropriate', 'other');--> statement-breakpoint
CREATE TYPE "public"."flag_resolution" AS ENUM('dismissed', 'content_hidden', 'author_warned', 'author_suspended');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('always', 'often', 'sometimes', 'rare');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('member', 'admin', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."reputation_level" AS ENUM('newcomer', 'contributor', 'expert', 'champion');--> statement-breakpoint
CREATE TYPE "public"."root_cause" AS ENUM('breaking-change', 'config', 'bug', 'misuse', 'dependency-conflict', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('new', 'established', 'trusted', 'verified', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('social_proof', 'dns_txt', 'sso');--> statement-breakpoint
CREATE TYPE "public"."vote_direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"trust_level" "trust_level" DEFAULT 'new' NOT NULL,
	"trust_updated_at" timestamp DEFAULT now(),
	"issues_created" integer DEFAULT 0 NOT NULL,
	"solutions_created" integer DEFAULT 0 NOT NULL,
	"comments_created" integer DEFAULT 0 NOT NULL,
	"accepted_solutions" integer DEFAULT 0 NOT NULL,
	"total_upvotes" integer DEFAULT 0 NOT NULL,
	"total_downvotes" integer DEFAULT 0 NOT NULL,
	"rejected_submissions" integer DEFAULT 0 NOT NULL,
	"flagged_content" integer DEFAULT 0 NOT NULL,
	"daily_issues_created" integer DEFAULT 0 NOT NULL,
	"daily_solutions_created" integer DEFAULT 0 NOT NULL,
	"daily_comments_created" integer DEFAULT 0 NOT NULL,
	"quota_reset_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_api_key_id" uuid,
	"content" text NOT NULL,
	"status" "content_status" DEFAULT 'approved' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp,
	"rejection_reason" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reporter_api_key_id" uuid,
	"reason" "flag_reason" NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"resolution" "flag_resolution"
);
--> statement-breakpoint
CREATE TABLE "domain_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"verification_method" "verification_method",
	"verification_token" varchar(64),
	"verified_at" timestamp,
	"sso_enabled" boolean DEFAULT false NOT NULL,
	"sso_config" jsonb,
	"domain_admin_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "issue_tags" (
	"issue_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "issue_tags_issue_id_tag_id_pk" PRIMARY KEY("issue_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_api_key_id" uuid,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"solution_count" integer DEFAULT 0 NOT NULL,
	"accepted_solution_id" uuid,
	"status" "content_status" DEFAULT 'approved' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp,
	"rejection_reason" text,
	"deleted_at" timestamp,
	"content_hash" text,
	"project" varchar(200),
	"tech_stack" text[],
	"packages" jsonb,
	"error_type" "error_type",
	"error_category" varchar(100),
	"severity" "severity",
	"environment" "environment",
	"file_types" text[],
	"code_patterns" text[],
	"affected_area" "affected_area",
	"frequency" "frequency",
	"has_minimal_repro" boolean,
	"steps_to_reproduce" integer,
	"root_cause" "root_cause",
	"fix_type" "fix_type",
	"complexity" "complexity",
	"time_to_resolve" varchar(20),
	"lessons_learned" text[],
	"related_patterns" text[],
	"custom_metadata" jsonb,
	"search_vector" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"metadata" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"domain_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"reviewed_by_id" uuid,
	"status" "share_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shared_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_issue_id" uuid NOT NULL,
	"origin_organization_id" uuid NOT NULL,
	"origin_issue_id" uuid NOT NULL,
	"share_request_id" uuid NOT NULL,
	"shared_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_api_key_id" uuid,
	"content" text NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"is_accepted" boolean DEFAULT false NOT NULL,
	"weaviate_indexed_at" timestamp,
	"status" "content_status" DEFAULT 'approved' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp,
	"rejection_reason" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" varchar(255),
	"image" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"tier" "user_tier" DEFAULT 'free' NOT NULL,
	"domain_id" uuid,
	"reputation_score" integer DEFAULT 0 NOT NULL,
	"reputation_level" "reputation_level" DEFAULT 'newcomer' NOT NULL,
	"total_accepted_solutions" integer DEFAULT 0 NOT NULL,
	"total_upvotes_received" integer DEFAULT 0 NOT NULL,
	"total_contributions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"direction" "vote_direction" NOT NULL,
	"context" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_api_key_id_api_keys_id_fk" FOREIGN KEY ("author_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reporter_api_key_id_api_keys_id_fk" FOREIGN KEY ("reporter_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_members" ADD CONSTRAINT "domain_members_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_members" ADD CONSTRAINT "domain_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_author_api_key_id_api_keys_id_fk" FOREIGN KEY ("author_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content" ADD CONSTRAINT "shared_content_public_issue_id_issues_id_fk" FOREIGN KEY ("public_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content" ADD CONSTRAINT "shared_content_origin_organization_id_organizations_id_fk" FOREIGN KEY ("origin_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content" ADD CONSTRAINT "shared_content_origin_issue_id_issues_id_fk" FOREIGN KEY ("origin_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content" ADD CONSTRAINT "shared_content_share_request_id_share_requests_id_fk" FOREIGN KEY ("share_request_id") REFERENCES "public"."share_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_author_api_key_id_api_keys_id_fk" FOREIGN KEY ("author_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_trust_level_idx" ON "api_keys" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX "comments_solution_id_idx" ON "comments" USING btree ("solution_id");--> statement-breakpoint
CREATE INDEX "comments_author_id_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_flags_content_idx" ON "content_flags" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "content_flags_reporter_idx" ON "content_flags" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "content_flags_resolved_idx" ON "content_flags" USING btree ("resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_member_unique" ON "domain_members" USING btree ("domain_id","user_id");--> statement-breakpoint
CREATE INDEX "domain_members_user_id_idx" ON "domain_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "domains_name_idx" ON "domains" USING btree ("name");--> statement-breakpoint
CREATE INDEX "domains_status_idx" ON "domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issue_tags_tag_id_idx" ON "issue_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "issues_organization_id_idx" ON "issues" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "issues_author_id_idx" ON "issues" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "issues_created_at_idx" ON "issues" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issues_content_hash_idx" ON "issues" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "issues_org_created_idx" ON "issues" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "issues_org_status_idx" ON "issues" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" USING btree ("project");--> statement-breakpoint
CREATE INDEX "issues_project_org_idx" ON "issues" USING btree ("project","organization_id");--> statement-breakpoint
CREATE INDEX "issues_error_type_idx" ON "issues" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX "issues_severity_idx" ON "issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "issues_affected_area_idx" ON "issues" USING btree ("affected_area");--> statement-breakpoint
CREATE INDEX "issues_type_severity_idx" ON "issues" USING btree ("error_type","severity");--> statement-breakpoint
CREATE INDEX "issues_area_type_idx" ON "issues" USING btree ("affected_area","error_type");--> statement-breakpoint
CREATE INDEX "issues_root_cause_idx" ON "issues" USING btree ("root_cause");--> statement-breakpoint
CREATE INDEX "issues_fix_type_idx" ON "issues" USING btree ("fix_type");--> statement-breakpoint
CREATE INDEX "issues_complexity_idx" ON "issues" USING btree ("complexity");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_api_key_id_idx" ON "notifications" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_member_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organizations_domain_id_idx" ON "organizations" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "share_requests_issue_id_idx" ON "share_requests" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "share_requests_status_idx" ON "share_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shared_content_public_issue_idx" ON "shared_content" USING btree ("public_issue_id");--> statement-breakpoint
CREATE INDEX "shared_content_origin_org_idx" ON "shared_content" USING btree ("origin_organization_id");--> statement-breakpoint
CREATE INDEX "solutions_issue_id_idx" ON "solutions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "solutions_author_id_idx" ON "solutions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "solutions_vote_count_idx" ON "solutions" USING btree ("vote_count");--> statement-breakpoint
CREATE INDEX "solutions_status_idx" ON "solutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_domain_id_idx" ON "users" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_solution_user_idx" ON "votes" USING btree ("solution_id","user_id");