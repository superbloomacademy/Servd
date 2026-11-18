CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"shift_id" uuid,
	"kind" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"amount_paise" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"staff_name" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_paise" integer NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"expected_paise" integer,
	"counted_paise" integer,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"variant_id" text,
	"stock_item_id" uuid NOT NULL,
	"qty" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" double precision DEFAULT 0 NOT NULL,
	"low_level" double precision DEFAULT 0 NOT NULL,
	"cost_paise" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" double precision NOT NULL,
	"cost_paise" integer DEFAULT 0 NOT NULL,
	"order_id" uuid,
	"supplier" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"staff_name" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "spot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "round_off_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "addon_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'qr' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bill_discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "round_off_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "payments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "guests" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "opened_by" uuid;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_venue_idx" ON "cash_entries" USING btree ("venue_id","at");--> statement-breakpoint
CREATE INDEX "shifts_venue_idx" ON "cash_shifts" USING btree ("venue_id","opened_at");--> statement-breakpoint
CREATE INDEX "recipes_item_idx" ON "recipes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_items_venue_idx" ON "stock_items" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "stock_moves_venue_idx" ON "stock_moves" USING btree ("venue_id","at");--> statement-breakpoint
CREATE INDEX "stock_moves_order_idx" ON "stock_moves" USING btree ("order_id");--> statement-breakpoint
-- Earlier paid orders and bills: record their single payment so reports by payment mode include them.
UPDATE "orders" SET "payments" = jsonb_build_array(jsonb_build_object('method', "pay_method", 'amountPaise', "total_paise"))
  WHERE "pay_status" = 'paid' AND "pay_method" IN ('upi_shop', 'cash') AND "payments" = '[]'::jsonb;--> statement-breakpoint
UPDATE "invoices" SET "payments" = jsonb_build_array(jsonb_build_object('method', "pay_method", 'amountPaise', "total_paise"))
  WHERE "pay_method" IN ('upi_shop', 'cash') AND "payments" = '[]'::jsonb;--> statement-breakpoint
UPDATE "table_sessions" SET "payments" = jsonb_build_array(jsonb_build_object('method', "pay_method", 'amountPaise', "total_paise"))
  WHERE "pay_status" = 'paid' AND "pay_method" IN ('upi_shop', 'cash') AND "total_paise" IS NOT NULL AND "payments" = '[]'::jsonb;
