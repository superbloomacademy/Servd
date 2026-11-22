// Database schema. All money is stored in PAISE (integer) to avoid rounding errors.
// Every business record carries vendorId and/or venueId, so many vendors share one database safely.
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, serial, bigserial, customType, primaryKey, uniqueIndex, index, doublePrecision,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- vendors & venues
export const vendors = pgTable('vendors', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color').notNull().default('#E23744'),
  legalName: text('legal_name'),
  gstin: text('gstin'),
  fssai: text('fssai'),
  address: text('address'),
  phone: text('phone'),
  commissionBps: integer('commission_bps').notNull().default(0),   // 250 = 2.5% per order
  monthlyFeePaise: integer('monthly_fee_paise').notNull().default(0),
  commissionCapPaise: integer('commission_cap_paise').notNull().default(0),   // most commission in one month (0 = no cap)
  status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
  // Onboarding: 'setup' until the owner (or we) press "Go live".
  stage: text('stage').$type<'setup' | 'live'>().notNull().default('setup'),
  liveAt: timestamp('live_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),   // no platform fees until this date
  contactName: text('contact_name'),
  email: text('email'),
  invoicePrefix: text('invoice_prefix'),     // GST bill numbers: PREFIX/2627/00001
  notes: text('notes').notNull().default(''), // internal notes, only super admin sees them
  // Plan modules the vendor may use. A missing key means ON (so older vendors keep everything).
  features: jsonb('features').$type<Partial<VendorFeatures>>().notNull().default({}),
  // Sample vendor for pitches: marked "Demo" everywhere, left out of platform totals and never billed.
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: created(),
});
export type VendorFeatures = { pos: boolean; inventory: boolean; customers: boolean };
export const featuresOf = (v: { features?: Partial<VendorFeatures> | null }): VendorFeatures => ({ pos: true, inventory: true, customers: true, ...(v.features || {}) });

// Prospective venues we are talking to (sales pipeline). Won leads become vendors.
export type LeadStage = 'new' | 'contacted' | 'demo' | 'trial' | 'won' | 'lost';
export const leads = pgTable('leads', {
  id: id(),
  business: text('business').notNull(),
  contactName: text('contact_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  city: text('city').notNull().default(''),
  type: text('type').$type<VenueType>().notNull().default('restaurant'),
  stage: text('stage').$type<LeadStage>().notNull().default('new'),
  source: text('source').notNull().default(''),
  notes: text('notes').notNull().default(''),
  nextFollowUp: text('next_follow_up'),       // YYYY-MM-DD
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  createdAt: created(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// What a vendor owes us for one month (commission + monthly fee). A row exists once we record it.
export const platformBills = pgTable('platform_bills', {
  id: id(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),             // YYYY-MM
  number: text('number').notNull().unique(),  // SV-2611-0001
  orders: integer('orders').notNull(),
  salesPaise: integer('sales_paise').notNull(),
  qrPaise: integer('qr_paise'),                // guest QR sales (the commission base); null on bills from before 18 Nov 2026
  onlinePaise: integer('online_paise').notNull(),
  cashPaise: integer('cash_paise').notNull(),
  commissionBps: integer('commission_bps').notNull(),
  commissionPaise: integer('commission_paise').notNull(),
  commissionCapPaise: integer('commission_cap_paise'),   // cap that applied this month (null/0 = none)
  feePaise: integer('fee_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  status: text('status').$type<'due' | 'paid' | 'waived'>().notNull().default('due'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  reference: text('reference'),
  createdAt: created(),
}, t => [uniqueIndex('pb_vendor_month').on(t.vendorId, t.month)]);

export type VenueType = 'theater' | 'restaurant' | 'cafe' | 'stall';
export type ServiceMode = 'seat_delivery' | 'table_bill' | 'table_prepay' | 'counter_token' | 'shop_qr';
export type VenueSettings = {
  acceptCash: boolean;          // customers may choose "pay cash at counter"
  unpaidCancelMin: number;      // auto-cancel pay-first orders not paid within N minutes
  startBeforePayment: boolean;  // send KOT to kitchen before payment is confirmed
  rescanMinutes: number;        // a scan older than this must be repeated before ordering
  sessionHours: number;         // a visit session never lasts longer than this
  pauseLastMin: number;         // theaters: stop orders N minutes before the show ends (0 = off)
  showWindowBeforeMin: number;  // theaters: ordering opens N minutes before show start
  roundOff?: boolean;           // round every bill to the nearest rupee (off when missing)
  approveFirstOrder?: boolean;  // running-bill tables: staff accept a table's first QR order (on when missing)
};
export const defaultSettings: VenueSettings = {
  acceptCash: true, unpaidCancelMin: 10, startBeforePayment: false, rescanMinutes: 90,
  sessionHours: 4, pauseLastMin: 0, showWindowBeforeMin: 30,
};

export const venues = pgTable('venues', {
  id: id(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').$type<VenueType>().notNull(),
  serviceMode: text('service_mode').$type<ServiceMode>().notNull(),
  address: text('address'),
  city: text('city'),
  upiId: text('upi_id'),
  upiName: text('upi_name'),
  upiQrUrl: text('upi_qr_url'),
  taxBps: integer('tax_bps').notNull().default(500),               // 500 = 5% GST
  isOpen: boolean('is_open').notNull().default(true),
  openTime: text('open_time').notNull().default('09:00'),
  closeTime: text('close_time').notNull().default('23:30'),
  settings: jsonb('settings').$type<VenueSettings>().notNull().default(defaultSettings),
  createdAt: created(),
}, t => [index('venues_vendor_idx').on(t.vendorId)]);

// Screen / floor section / counter zone
export const areas = pgTable('areas', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  rows: text('rows'),                 // theaters: "A-J"
  seatsPerRow: integer('seats_per_row'),
  sort: integer('sort').notNull().default(0),
});

// Seat / table / counter. `code` is the secret printed in its QR: /q/<code>
export const spots = pgTable('spots', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').$type<'seat' | 'table' | 'counter' | 'shop'>().notNull(),
  code: text('code').notNull().unique(),
  active: boolean('active').notNull().default(true),
  codeReplacedAt: timestamp('code_replaced_at', { withTimezone: true }),
  sort: integer('sort').notNull().default(0),
}, t => [index('spots_venue_idx').on(t.venueId)]);

export const shows = pgTable('shows', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
  movie: text('movie').notNull(),
  time: text('time').notNull(),                       // daily start "HH:MM"
  durationMin: integer('duration_min').notNull().default(150),
  intervalAfterMin: integer('interval_after_min').notNull().default(75),
});

// ---------------------------------------------------------------- menu
export const stations = pgTable('stations', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isLive: boolean('is_live').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const categories = pgTable('categories', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isLive: boolean('is_live').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const items = pgTable('items', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  stationId: uuid('station_id').references(() => stations.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  pricePaise: integer('price_paise').notNull(),
  veg: boolean('veg').notNull().default(true),
  imageUrl: text('image_url'),
  isLive: boolean('is_live').notNull().default(true),
  stockOff: boolean('stock_off').notNull().default(false),   // switched off by the system because a material ran out
  shortCode: text('short_code').notNull().default(''),       // fast typing on the billing screen: "BC" or "12"
  favourite: boolean('favourite').notNull().default(false),
  tags: text('tags').array().notNull().default([]),   // bestseller | new | spicy | must_try
  // Sizes like Half / Full, each with its own price. Empty = one price (pricePaise).
  variants: jsonb('variants').$type<ItemVariant[]>().notNull().default([]),
  // Add-on groups like "Extra toppings" (choose 0-3). Empty = none.
  addonGroups: jsonb('addon_groups').$type<AddonGroup[]>().notNull().default([]),
  sort: integer('sort').notNull().default(0),
  createdAt: created(),
}, t => [index('items_venue_idx').on(t.venueId)]);
export type ItemVariant = { id: string; name: string; pricePaise: number };
export type AddonOption = { id: string; name: string; pricePaise: number; veg: boolean };
export type AddonGroup = { id: string; name: string; min: number; max: number; options: AddonOption[] };

// ---------------------------------------------------------------- people
export type StaffRole = 'super_admin' | 'owner' | 'manager' | 'cashier' | 'station' | 'captain' | 'runner';
export const staff = pgTable('staff', {
  id: id(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash').notNull(),
  role: text('role').$type<StaffRole>().notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  venueId: uuid('venue_id').references(() => venues.id),   // null for owner = all venues of the vendor
  stationId: uuid('station_id').references(() => stations.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
});

export const customers = pgTable('customers', {
  id: id(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().default(''),   // login email, verified by OTP; one email per customer
  createdAt: created(),
}, t => [uniqueIndex('customers_email_uq').on(sql`lower(${t.email})`).where(sql`${t.email} <> ''`)]);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  kind: text('kind').$type<'customer' | 'staff'>().notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// One pending login code per phone number. For now the code is sent to `email` (SMS later).
export const otps = pgTable('otps', {
  phone: text('phone').primaryKey(),
  email: text('email').notNull().default(''),
  code: text('code').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  tries: integer('tries').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------- visits, tables, orders
// A visit starts when a QR is scanned. Ordering is only allowed inside a valid visit.
export const visits = pgTable('visits', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  spotId: uuid('spot_id').notNull().references(() => spots.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id),
  tableSessionId: uuid('table_session_id'),
  lastScanAt: timestamp('last_scan_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
});

// A running bill for a table (restaurants, open-bill cafés).
export const tableSessions = pgTable('table_sessions', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  spotId: uuid('spot_id').notNull().references(() => spots.id, { onDelete: 'cascade' }),
  status: text('status').$type<'open' | 'bill_requested' | 'closed' | 'merged'>().notNull().default('open'),
  payStatus: text('pay_status').$type<'unpaid' | 'claimed' | 'paid'>().notNull().default('unpaid'),
  payMethod: text('pay_method').$type<PayMethod>(),
  payments: jsonb('payments').$type<Payment[]>().notNull().default([]),
  guests: integer('guests').notNull().default(0),
  mergedInto: uuid('merged_into'),
  openedBy: uuid('opened_by'),
  // Staff saw the guests (accepted the first QR order, or took an order here). Until then QR orders wait, so a photo of the QR can't send food to the kitchen.
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: text('accepted_by'),
  utrLast4: text('utr_last4'),
  billNo: integer('bill_no'),
  totalPaise: integer('total_paise'),
  paidConfirmedBy: uuid('paid_confirmed_by').references(() => staff.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  billRequestedAt: timestamp('bill_requested_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, t => [index('ts_venue_idx').on(t.venueId, t.status)]);

export type OrderStatus = 'awaiting_payment' | 'confirmed' | 'preparing' | 'ready' | 'out' | 'delivered' | 'cancelled' | 'rejected';
export type PayStatus = 'unpaid' | 'claimed' | 'paid' | 'on_bill';
export type PayMethod = 'upi_shop' | 'cash' | 'bill' | 'card' | 'online' | 'split';
export type Payment = { method: 'upi_shop' | 'cash' | 'card' | 'online'; amountPaise: number };
export type Channel = 'qr' | 'pos' | 'zomato' | 'swiggy' | 'phone' | 'other';
export type TimelineEntry = { status: string; at: string; by?: string };

export const orders = pgTable('orders', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  customerId: uuid('customer_id').references(() => customers.id),   // null for a walk-in billed by staff without a phone
  spotId: uuid('spot_id').references(() => spots.id),               // null for takeaway / delivery billed by staff
  tableSessionId: uuid('table_session_id').references(() => tableSessions.id),
  channel: text('channel').$type<Channel>().notNull().default('qr'),   // qr = guest ordered by QR; pos = staff billing screen
  createdBy: uuid('created_by'),                                       // staff who billed it (POS)
  guestName: text('guest_name').notNull().default(''),
  guestPhone: text('guest_phone').notNull().default(''),
  deliveryAddress: text('delivery_address').notNull().default(''),
  externalRef: text('external_ref'),                                   // Zomato / Swiggy order id
  payments: jsonb('payments').$type<Payment[]>().notNull().default([]),
  billDiscountPaise: integer('bill_discount_paise').notNull().default(0),   // staff discount (part of discountPaise)
  discountReason: text('discount_reason'),
  roundOffPaise: integer('round_off_paise').notNull().default(0),
  kotNo: integer('kot_no').notNull(),                  // daily number per venue, shown to customer
  businessDate: text('business_date').notNull(),       // YYYY-MM-DD (venue local day)
  status: text('status').$type<OrderStatus>().notNull(),
  payStatus: text('pay_status').$type<PayStatus>().notNull(),
  payMethod: text('pay_method').$type<PayMethod>(),
  utrLast4: text('utr_last4'),
  paidConfirmedBy: uuid('paid_confirmed_by').references(() => staff.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  fulfilment: text('fulfilment').$type<'seat' | 'table' | 'pickup' | 'delivery'>().notNull(),
  deliverAt: text('deliver_at').$type<'now' | 'interval'>().notNull().default('now'),
  releaseAt: timestamp('release_at', { withTimezone: true }),   // interval orders reach the kitchen at this time
  showLabel: text('show_label'),
  spotLabel: text('spot_label').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  discountPaise: integer('discount_paise').notNull().default(0),
  taxPaise: integer('tax_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  couponCode: text('coupon_code'),
  note: text('note').notNull().default(''),
  rejectReason: text('reject_reason'),
  timeline: jsonb('timeline').$type<TimelineEntry[]>().notNull().default([]),
  createdAt: created(),
}, t => [
  index('orders_venue_idx').on(t.venueId, t.createdAt),
  index('orders_customer_idx').on(t.customerId, t.createdAt),
  index('orders_kot_idx').on(t.venueId, t.businessDate, t.kotNo),
]);

export const orderItems = pgTable('order_items', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  stationId: uuid('station_id'),
  name: text('name').notNull(),
  pricePaise: integer('price_paise').notNull(),
  qty: integer('qty').notNull(),
  veg: boolean('veg').notNull(),
  variantId: text('variant_id'),
  variantName: text('variant_name'),
  addons: jsonb('addons').$type<{ id?: string; name: string; pricePaise: number }[]>().notNull().default([]),
  note: text('note').notNull().default(''),     // "less spicy", printed on the KOT
}, t => [index('oi_order_idx').on(t.orderId)]);

// One KOT per station per order.
export const kots = pgTable('kots', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  venueId: uuid('venue_id').notNull().references(() => venues.id),
  stationId: uuid('station_id'),
  stationName: text('station_name').notNull(),
  status: text('status').$type<'held' | 'new' | 'preparing' | 'ready'>().notNull(),
  createdAt: created(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
}, t => [index('kots_venue_idx').on(t.venueId, t.status)]);

export const dailyCounters = pgTable('daily_counters', {
  venueId: uuid('venue_id').notNull(),
  date: text('date').notNull(),
  kind: text('kind').notNull(),      // 'kot' | 'bill'
  last: integer('last').notNull().default(0),
}, t => [primaryKey({ columns: [t.venueId, t.date, t.kind] })]);

// ---------------------------------------------------------------- GST bills (tax invoices)
// One bill per paid order (pay-first modes) or per closed table (running bill).
// Numbers run in sequence per vendor per financial year (April–March), as GST rules require.
export type InvoiceLine = { name: string; qty: number; pricePaise: number; veg: boolean };
export const invoices = pgTable('invoices', {
  id: id(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  venueId: uuid('venue_id').notNull().references(() => venues.id),
  orderId: uuid('order_id').references(() => orders.id).unique(),
  tableSessionId: uuid('table_session_id').references(() => tableSessions.id).unique(),
  customerId: uuid('customer_id').references(() => customers.id),
  fy: text('fy').notNull(),                   // "2026-27"
  seq: integer('seq').notNull(),
  number: text('number').notNull(),           // "AUR/2627/00042"
  status: text('status').$type<'issued' | 'cancelled'>().notNull().default('issued'),
  kotNos: integer('kot_nos').array().notNull().default([]),
  spotLabel: text('spot_label').notNull().default(''),
  customerName: text('customer_name').notNull().default(''),
  customerPhone: text('customer_phone').notNull().default(''),
  lines: jsonb('lines').$type<InvoiceLine[]>().notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  discountPaise: integer('discount_paise').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  taxBps: integer('tax_bps').notNull(),
  cgstPaise: integer('cgst_paise').notNull(),
  sgstPaise: integer('sgst_paise').notNull(),
  roundOffPaise: integer('round_off_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull(),
  payMethod: text('pay_method').notNull(),
  payments: jsonb('payments').$type<Payment[]>().notNull().default([]),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
}, t => [
  uniqueIndex('inv_vendor_fy_seq').on(t.vendorId, t.fy, t.seq),
  index('inv_venue_idx').on(t.venueId, t.issuedAt),
]);

export const invoiceCounters = pgTable('invoice_counters', {
  vendorId: uuid('vendor_id').notNull(),
  fy: text('fy').notNull(),
  last: integer('last').notNull().default(0),
}, t => [primaryKey({ columns: [t.vendorId, t.fy] })]);

// ---------------------------------------------------------------- offers, help, audit
export const coupons = pgTable('coupons', {
  id: id(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  venueId: uuid('venue_id').references(() => venues.id),   // null = all venues of the vendor
  code: text('code').notNull(),
  type: text('type').$type<'percent' | 'flat'>().notNull(),
  value: integer('value').notNull(),                        // percent, or paise for flat
  maxDiscountPaise: integer('max_discount_paise').notNull().default(0),
  minOrderPaise: integer('min_order_paise').notNull().default(0),
  usageLimit: integer('usage_limit').notNull().default(0),
  perCustomer: integer('per_customer').notNull().default(0),
  used: integer('used').notNull().default(0),
  description: text('description').notNull().default(''),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
}, t => [uniqueIndex('coupons_code_idx').on(t.vendorId, t.code)]);

export const serviceRequests = pgTable('service_requests', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  spotId: uuid('spot_id').notNull().references(() => spots.id, { onDelete: 'cascade' }),
  tableSessionId: uuid('table_session_id'),
  kind: text('kind').$type<'waiter' | 'water' | 'bill'>().notNull(),
  status: text('status').$type<'open' | 'done'>().notNull().default('open'),
  createdAt: created(),
});

export const supportTickets = pgTable('support_tickets', {
  id: id(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  venueId: uuid('venue_id').references(() => venues.id),
  orderId: uuid('order_id').references(() => orders.id),
  topic: text('topic').notNull(),
  message: text('message').notNull(),
  status: text('status').$type<'open' | 'resolved'>().notNull().default('open'),
  reply: text('reply'),
  createdAt: created(),
});

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  vendorId: uuid('vendor_id'),
  venueId: uuid('venue_id'),
  staffId: uuid('staff_id'),
  staffName: text('staff_name'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('audit_venue_idx').on(t.venueId, t.at)]);

// ---------------------------------------------------------------- live updates & photos (work on Vercel too)
// Every live event (new order, payment, KOT ready…) is one row; screens fetch new rows every ~1.5 s.
// Rows older than 15 minutes are deleted by the background jobs.
export const rtEvents = pgTable('rt_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  rooms: text('rooms').array().notNull(),
  event: text('event').notNull(),
  data: jsonb('data'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
// Logos and food photos (already shrunk in the browser). Served at /uploads/<name> with long caching.
export const uploads = pgTable('uploads', {
  name: text('name').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: bytea('bytes').notNull(),
  size: integer('size').notNull(),
  createdAt: created(),
});

// ---------------------------------------------------------------- cash drawer (one open shift per venue)
export const cashShifts = pgTable('cash_shifts', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  openedBy: text('opened_by').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  openingPaise: integer('opening_paise').notNull(),
  closedBy: text('closed_by'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  expectedPaise: integer('expected_paise'),
  countedPaise: integer('counted_paise'),
  note: text('note').notNull().default(''),
}, t => [index('shifts_venue_idx').on(t.venueId, t.openedAt)]);

// Cash put in, taken out, or spent from the drawer (petty expenses: vegetables, gas, tips…).
export const cashEntries = pgTable('cash_entries', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  shiftId: uuid('shift_id').references(() => cashShifts.id, { onDelete: 'set null' }),
  kind: text('kind').$type<'in' | 'out' | 'expense'>().notNull(),
  category: text('category').notNull().default(''),
  amountPaise: integer('amount_paise').notNull(),
  note: text('note').notNull().default(''),
  staffName: text('staff_name').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('cash_entries_venue_idx').on(t.venueId, t.at)]);

// ---------------------------------------------------------------- inventory
// Raw materials. Quantities are in the material's unit (kg, litre, pcs…).
export const stockItems = pgTable('stock_items', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  unit: text('unit').notNull(),                       // kg | g | l | ml | pcs | pack
  qty: doublePrecision('qty').notNull().default(0),   // stock on hand
  lowLevel: doublePrecision('low_level').notNull().default(0),
  costPaise: integer('cost_paise').notNull().default(0),   // last purchase cost per unit
  avgCost: doublePrecision('avg_cost').notNull().default(0),   // weighted average cost per unit, in paise (not rounded)
  kind: text('kind').$type<'raw' | 'prep'>().notNull().default('raw'),   // prep = made in the kitchen (gravy, dough, batter)
  category: text('category').notNull().default(''),
  buyUnit: text('buy_unit').notNull().default(''),         // how it is bought: "box", "sack". Empty = same as unit
  buyFactor: doublePrecision('buy_factor').notNull().default(1),   // 1 buyUnit = buyFactor x unit
  yieldPct: doublePrecision('yield_pct').notNull().default(100),   // usable part after cleaning / peeling
  batchQty: doublePrecision('batch_qty').notNull().default(0),     // prep only: how much one batch of its recipe makes
  reorderQty: doublePrecision('reorder_qty').notNull().default(0), // how much to order when low
  shelfDays: integer('shelf_days').notNull().default(0),           // 0 = no expiry tracking
  supplierId: uuid('supplier_id'),                                 // usual supplier
  autoOff: boolean('auto_off').notNull().default(false),           // switch its dishes off when it runs out
  active: boolean('active').notNull().default(true),
  createdAt: created(),
}, t => [index('stock_items_venue_idx').on(t.venueId)]);

// How much of each material one portion uses. variantId null = every size (unless the size has its own lines).
export const recipes = pgTable('recipes', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  variantId: text('variant_id'),
  addonId: text('addon_id'),                  // set = this line belongs to one add-on ("Extra cheese"), not to the dish itself
  stockItemId: uuid('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  qty: doublePrecision('qty').notNull(),      // usable quantity in the material's unit (yield is applied when stock goes down)
}, t => [index('recipes_item_idx').on(t.itemId)]);

// What one batch of a prepared item is made from.
export const prepLines = pgTable('prep_lines', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  prepId: uuid('prep_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  stockItemId: uuid('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  qty: doublePrecision('qty').notNull(),
}, t => [index('prep_lines_idx').on(t.prepId)]);

export const suppliers = pgTable('suppliers', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  notes: text('notes').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
}, t => [index('suppliers_venue_idx').on(t.venueId)]);

// A purchase: an order to a supplier (or a bill entered directly), received in one or more deliveries.
export const purchases = pgTable('purchases', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  number: integer('number').notNull(),
  status: text('status').$type<'ordered' | 'part' | 'received' | 'cancelled'>().notNull().default('ordered'),
  expectedOn: text('expected_on'),             // YYYY-MM-DD
  note: text('note').notNull().default(''),
  createdBy: text('created_by').notNull().default(''),
  createdAt: created(),
}, t => [uniqueIndex('purchases_no_uq').on(t.venueId, t.number)]);
export const purchaseLines = pgTable('purchase_lines', {
  id: id(),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  stockItemId: uuid('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  unit: text('unit').notNull(),                // the unit it was ordered in
  factor: doublePrecision('factor').notNull(), // x stock unit
  qty: doublePrecision('qty').notNull(),       // ordered
  received: doublePrecision('received').notNull().default(0),
  ratePaise: doublePrecision('rate_paise').notNull().default(0),   // per ordered unit, before tax
  taxBps: integer('tax_bps').notNull().default(0),
}, t => [index('purchase_lines_idx').on(t.purchaseId)]);
// One delivery against a purchase = one supplier bill.
export const receipts = pgTable('receipts', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  billNo: text('bill_no').notNull().default(''),
  billDate: text('bill_date').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  taxPaise: integer('tax_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  lines: jsonb('lines').$type<{ stockItemId: string; name: string; qty: number; unit: string; ratePaise: number; taxBps: number; expiry: string | null }[]>().notNull().default([]),
  by: text('by').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('receipts_venue_idx').on(t.venueId, t.at)]);
export const supplierPayments = pgTable('supplier_payments', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  amountPaise: integer('amount_paise').notNull(),
  method: text('method').$type<'cash' | 'upi' | 'bank' | 'card'>().notNull(),
  fromDrawer: boolean('from_drawer').notNull().default(false),
  note: text('note').notNull().default(''),
  by: text('by').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('supplier_payments_idx').on(t.venueId, t.supplierId)]);

// Deliveries of materials that expire. What is left of each is worked out from the stock on hand (oldest used first).
export const stockBatches = pgTable('stock_batches', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  stockItemId: uuid('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  qty: doublePrecision('qty').notNull(),
  expiry: text('expiry').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('stock_batches_idx').on(t.stockItemId)]);

// A full physical count. Expected is frozen when the count is finished; the difference is the variance.
export const stockCounts = pgTable('stock_counts', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  by: text('by').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  lines: jsonb('lines').$type<{ stockItemId: string; name: string; unit: string; expected: number; counted: number; cost: number }[]>().notNull(),
  shortPaise: integer('short_paise').notNull(),
  extraPaise: integer('extra_paise').notNull(),
}, t => [index('stock_counts_idx').on(t.venueId, t.at)]);

// Stock sent from one branch to another of the same owner.
export const stockTransfers = pgTable('stock_transfers', {
  id: id(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  fromVenueId: uuid('from_venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  toVenueId: uuid('to_venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  status: text('status').$type<'sent' | 'received' | 'cancelled'>().notNull().default('sent'),
  lines: jsonb('lines').$type<{ stockItemId: string; name: string; unit: string; qty: number; received?: number; cost: number }[]>().notNull(),
  note: text('note').notNull().default(''),
  sentBy: text('sent_by').notNull(),
  receivedBy: text('received_by'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  receivedAt: timestamp('received_at', { withTimezone: true }),
}, t => [index('stock_transfers_from').on(t.fromVenueId), index('stock_transfers_to').on(t.toVenueId)]);

export type StockMoveKind = 'purchase' | 'sale' | 'return' | 'wastage' | 'adjust' | 'count' | 'made' | 'used' | 'sent' | 'arrived';
// Every stock change: purchase (+), sale (−), sale reversed (+), wastage (−), count adjustment (±).
export const stockMoves = pgTable('stock_moves', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  stockItemId: uuid('stock_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<StockMoveKind>().notNull(),
  unitCost: doublePrecision('unit_cost').notNull().default(0),   // average cost per unit (paise) at that moment
  refId: uuid('ref_id'),                              // receipt, count, transfer or production it came from
  qty: doublePrecision('qty').notNull(),                 // signed
  costPaise: integer('cost_paise').notNull().default(0),   // purchases: total paid
  orderId: uuid('order_id'),
  supplier: text('supplier').notNull().default(''),
  note: text('note').notNull().default(''),
  staffName: text('staff_name').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('stock_moves_venue_idx').on(t.venueId, t.at), index('stock_moves_order_idx').on(t.orderId)]);
