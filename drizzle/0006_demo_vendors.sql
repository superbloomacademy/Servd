ALTER TABLE "vendors" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Demo vendors created before this flag existed (the four sample vendors from the demo data).
UPDATE "vendors" SET "is_demo" = true WHERE "slug" IN ('aurora', 'spice-route', 'brew-bay', 'chaat-corner');
