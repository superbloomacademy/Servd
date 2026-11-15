// Database schema. All money is stored in PAISE (integer) to avoid rounding errors.
// Every business record carries vendorId and/or venueId, so many vendors share one database safely.
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, serial, bigserial, customType, primaryKey, uniqueIndex, index,
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
  status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
  // Onboarding: 'setup' until the owner (or we) press "Go live".
  stage: text('stage').$type<'setup' | 'live'>().notNull().default('setup'),
  liveAt: timestamp('live_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),   // no platform fees until this date
  contactName: text('contact_name'),
  email: text('email'),
  invoicePrefix: text('invoice_prefix'),     // GST bill numbers: PREFIX/2627/00001
  notes: text('notes').notNull().default(''), // internal notes, only super admin sees them
  createdAt: created(),
});

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
  onlinePaise: integer('online_paise').notNull(),
  cashPaise: integer('cash_paise').notNull(),
  commissionBps: integer('commission_bps').notNull(),
  commissionPaise: integer('commission_paise').notNull(),
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
  tags: text('tags').array().notNull().default([]),   // bestseller | new | spicy | must_try
  sort: integer('sort').notNull().default(0),
  createdAt: created(),
}, t => [index('items_venue_idx').on(t.venueId)]);

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
  status: text('status').$type<'open' | 'bill_requested' | 'closed'>().notNull().default('open'),
  payStatus: text('pay_status').$type<'unpaid' | 'claimed' | 'paid'>().notNull().default('unpaid'),
  payMethod: text('pay_method').$type<'upi_shop' | 'cash'>(),
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
export type PayMethod = 'upi_shop' | 'cash' | 'bill';
export type TimelineEntry = { status: string; at: string; by?: string };

export const orders = pgTable('orders', {
  id: id(),
  venueId: uuid('venue_id').notNull().references(() => venues.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  spotId: uuid('spot_id').notNull().references(() => spots.id),
  tableSessionId: uuid('table_session_id').references(() => tableSessions.id),
  kotNo: integer('kot_no').notNull(),                  // daily number per venue, shown to customer
  businessDate: text('business_date').notNull(),       // YYYY-MM-DD (venue local day)
  status: text('status').$type<OrderStatus>().notNull(),
  payStatus: text('pay_status').$type<PayStatus>().notNull(),
  payMethod: text('pay_method').$type<PayMethod>(),
  utrLast4: text('utr_last4'),
  paidConfirmedBy: uuid('paid_confirmed_by').references(() => staff.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  fulfilment: text('fulfilment').$type<'seat' | 'table' | 'pickup'>().notNull(),
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
  totalPaise: integer('total_paise').notNull(),
  payMethod: text('pay_method').notNull(),
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
