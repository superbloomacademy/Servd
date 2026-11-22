CREATE TABLE "prep_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"prep_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"factor" double precision NOT NULL,
	"qty" double precision NOT NULL,
	"received" double precision DEFAULT 0 NOT NULL,
	"rate_paise" double precision DEFAULT 0 NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"supplier_id" uuid,
	"number" integer NOT NULL,
	"status" text DEFAULT 'ordered' NOT NULL,
	"expected_on" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"supplier_id" uuid,
	"bill_no" text DEFAULT '' NOT NULL,
	"bill_date" text NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" double precision NOT NULL,
	"expiry" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"lines" jsonb NOT NULL,
	"short_paise" integer NOT NULL,
	"extra_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"from_venue_id" uuid NOT NULL,
	"to_venue_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"lines" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sent_by" text NOT NULL,
	"received_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" text NOT NULL,
	"from_drawer" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "stock_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "short_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "addon_id" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "avg_cost" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "kind" text DEFAULT 'raw' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "buy_unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "buy_factor" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "yield_pct" double precision DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "batch_qty" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "reorder_qty" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "shelf_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "auto_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "unit_cost" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "ref_id" uuid;--> statement-breakpoint
ALTER TABLE "prep_lines" ADD CONSTRAINT "prep_lines_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_lines" ADD CONSTRAINT "prep_lines_prep_id_stock_items_id_fk" FOREIGN KEY ("prep_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_lines" ADD CONSTRAINT "prep_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_venue_id_venues_id_fk" FOREIGN KEY ("from_venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_venue_id_venues_id_fk" FOREIGN KEY ("to_venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prep_lines_idx" ON "prep_lines" USING btree ("prep_id");--> statement-breakpoint
CREATE INDEX "purchase_lines_idx" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_no_uq" ON "purchases" USING btree ("venue_id","number");--> statement-breakpoint
CREATE INDEX "receipts_venue_idx" ON "receipts" USING btree ("venue_id","at");--> statement-breakpoint
CREATE INDEX "stock_batches_idx" ON "stock_batches" USING btree ("stock_item_id");--> statement-breakpoint
CREATE INDEX "stock_counts_idx" ON "stock_counts" USING btree ("venue_id","at");--> statement-breakpoint
CREATE INDEX "stock_transfers_from" ON "stock_transfers" USING btree ("from_venue_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_to" ON "stock_transfers" USING btree ("to_venue_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_idx" ON "supplier_payments" USING btree ("venue_id","supplier_id");--> statement-breakpoint
CREATE INDEX "suppliers_venue_idx" ON "suppliers" USING btree ("venue_id");--> statement-breakpoint
-- Start the average cost from the last known cost.
UPDATE "stock_items" SET "avg_cost" = "cost_paise";--> statement-breakpoint
UPDATE "stock_moves" m SET "unit_cost" = s."cost_paise" FROM "stock_items" s WHERE s."id" = m."stock_item_id";
