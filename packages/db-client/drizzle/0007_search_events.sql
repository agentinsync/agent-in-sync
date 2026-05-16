CREATE TABLE IF NOT EXISTS "search_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "query" text NOT NULL,
  "result_count" integer NOT NULL,
  "search_type" varchar(50),
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "search_events" ADD CONSTRAINT "search_events_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "search_events_org_results_idx"
  ON "search_events" ("organization_id","result_count","created_at");
