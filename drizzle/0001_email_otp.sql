ALTER TABLE "otps" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "sent_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "customers" c SET "email" = '' WHERE c."email" <> '' AND EXISTS (SELECT 1 FROM "customers" d WHERE d."email" <> '' AND lower(d."email") = lower(c."email") AND (d."created_at", d."id") < (c."created_at", c."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_uq" ON "customers" USING btree (lower("email")) WHERE "customers"."email" <> '';