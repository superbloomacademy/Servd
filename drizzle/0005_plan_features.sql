ALTER TABLE "platform_bills" ADD COLUMN "qr_paise" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;