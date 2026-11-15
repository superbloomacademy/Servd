CREATE TABLE "invoice_counters" (
	"vendor_id" uuid NOT NULL,
	"fy" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_vendor_id_fy_pk" PRIMARY KEY("vendor_id","fy")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"order_id" uuid,
	"table_session_id" uuid,
	"customer_id" uuid,
	"fy" text NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"kot_nos" integer[] DEFAULT '{}' NOT NULL,
	"spot_label" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer NOT NULL,
	"taxable_paise" integer NOT NULL,
	"tax_bps" integer NOT NULL,
	"cgst_paise" integer NOT NULL,
	"sgst_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"pay_method" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "invoices_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "invoices_table_session_id_unique" UNIQUE("table_session_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'restaurant' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"next_follow_up" text,
	"vendor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"month" text NOT NULL,
	"number" text NOT NULL,
	"orders" integer NOT NULL,
	"sales_paise" integer NOT NULL,
	"online_paise" integer NOT NULL,
	"cash_paise" integer NOT NULL,
	"commission_bps" integer NOT NULL,
	"commission_paise" integer NOT NULL,
	"fee_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"paid_at" timestamp with time zone,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_bills_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "stage" text DEFAULT 'setup' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "live_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "invoice_prefix" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_bills" ADD CONSTRAINT "platform_bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inv_vendor_fy_seq" ON "invoices" USING btree ("vendor_id","fy","seq");--> statement-breakpoint
CREATE INDEX "inv_venue_idx" ON "invoices" USING btree ("venue_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pb_vendor_month" ON "platform_bills" USING btree ("vendor_id","month");--> statement-breakpoint
UPDATE "vendors" SET "stage" = 'live', "live_at" = "created_at";
