DROP INDEX "wiki_page_votes_page_user_idx";--> statement-breakpoint
ALTER TABLE "wiki_page_votes" ADD COLUMN "version" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_votes_page_version_user_idx" ON "wiki_page_votes" USING btree ("wiki_page_id","version","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_votes_page_version_apikey_idx" ON "wiki_page_votes" USING btree ("wiki_page_id","version","api_key_id") WHERE api_key_id IS NOT NULL;