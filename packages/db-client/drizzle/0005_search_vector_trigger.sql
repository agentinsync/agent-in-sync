-- Move search_vector trigger + GIN indexes from application startup into the migration
-- so they exist regardless of whether the backend is running.

CREATE OR REPLACE FUNCTION issues_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.project, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS issues_search_vector_trigger ON issues;
--> statement-breakpoint

CREATE TRIGGER issues_search_vector_trigger
  BEFORE INSERT OR UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_search_vector_update();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS issues_tech_stack_gin_idx ON issues USING GIN (tech_stack);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_packages_gin_idx ON issues USING GIN (packages);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_file_types_gin_idx ON issues USING GIN (file_types);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_code_patterns_gin_idx ON issues USING GIN (code_patterns);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_lessons_gin_idx ON issues USING GIN (lessons_learned);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_patterns_gin_idx ON issues USING GIN (related_patterns);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_search_vector_gin_idx ON issues USING GIN (search_vector);
--> statement-breakpoint

-- Backfill: trigger a no-op UPDATE on rows with null search_vector
-- so the BEFORE UPDATE trigger populates them.
UPDATE issues SET updated_at = updated_at WHERE search_vector IS NULL;
