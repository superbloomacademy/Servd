ALTER TABLE "platform_bills" ADD COLUMN "commission_cap_paise" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "commission_cap_paise" integer DEFAULT 0 NOT NULL;