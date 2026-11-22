ALTER TABLE "table_sessions" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "accepted_by" text;--> statement-breakpoint
-- Tables already being served when this ships are accepted, so their next QR orders are not held.
UPDATE "table_sessions" SET "accepted_at" = "opened_at" WHERE "status" IN ('open', 'bill_requested') AND EXISTS (SELECT 1 FROM "orders" o WHERE o."table_session_id" = "table_sessions"."id");
