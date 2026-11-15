export type Vendor = { name: string; logoUrl: string | null; brandColor: string; legalName: string | null; gstin: string | null; fssai: string | null; address: string | null };
export type Venue = {
  id: string; name: string; type: 'theater' | 'restaurant' | 'cafe' | 'stall';
  serviceMode: 'seat_delivery' | 'table_bill' | 'table_prepay' | 'counter_token' | 'shop_qr';
  city: string | null; taxBps: number; upiId: string | null; upiName: string | null; upiQrUrl: string | null;
  acceptCash: boolean; unpaidCancelMin: number; openTime: string; closeTime: string;
};
export type Item = { id: string; categoryId: string; name: string; description: string; pricePaise: number; veg: boolean; imageUrl: string | null; tags: string[]; available: boolean };
export type Show = { movie: string; time: string; started: boolean; minutesToInterval: number; minutesToEnd: number; intervalAt: string };
export type ScanData = {
  vendor: Vendor; venue: Venue;
  spot: { label: string; kind: 'seat' | 'table' | 'counter' | 'shop'; areaName: string | null };
  window: { open: boolean; until?: string; reason?: string; show: Show | null };
  visit: { id: string; expiresAt: string } | null;
  tableSessionId: string | null;
  menu: { categories: { id: string; name: string; isLive: boolean }[]; items: Item[] };
  mostOrdered: string[];
  offers: { code: string; description: string; type: string; value: number; minOrderPaise: number }[];
  customer: { name: string; phone: string } | null;
};
export type OrderView = {
  id: string; venueId: string; kotNo: number;
  status: 'awaiting_payment' | 'confirmed' | 'preparing' | 'ready' | 'out' | 'delivered' | 'cancelled' | 'rejected';
  payStatus: 'unpaid' | 'claimed' | 'paid' | 'on_bill'; payMethod: 'upi_shop' | 'cash' | 'bill' | null;
  fulfilment: 'seat' | 'table' | 'pickup'; deliverAt: 'now' | 'interval'; releaseAt: string | null;
  showLabel: string | null; spotLabel: string; subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number;
  couponCode: string | null; note: string; rejectReason: string | null; timeline: { status: string; at: string; by?: string }[];
  createdAt: string; tableSessionId: string | null; utrLast4: string | null;
  items: { name: string; qty: number; pricePaise: number; veg: boolean }[];
  venue?: { venueName: string; brandColor: string; logoUrl: string | null; vendorName: string };
};
export type Quote = {
  subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number; taxBps: number;
  coupon: { ok: boolean; code?: string; discount?: number; error?: string } | null;
  coupons: { code: string; description: string; minOrderPaise: number; applicable: boolean; savePaise: number; addMorePaise: number; reason: string | null }[];
  completeYourMeal: string[];
  error?: string; soldOut?: boolean;
};

export const ACTIVE = ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'out'];
