export type Vendor = { name: string; logoUrl: string | null; brandColor: string; legalName: string | null; gstin: string | null; fssai: string | null; address: string | null; isDemo?: boolean };
export type Venue = {
  id: string; name: string; type: 'theater' | 'restaurant' | 'cafe' | 'stall';
  serviceMode: 'seat_delivery' | 'table_bill' | 'table_prepay' | 'counter_token' | 'shop_qr';
  city: string | null; taxBps: number; upiId: string | null; upiName: string | null; upiQrUrl: string | null;
  acceptCash: boolean; unpaidCancelMin: number; openTime: string; closeTime: string;
};
export type Item = {
  id: string; categoryId: string; name: string; description: string; pricePaise: number; veg: boolean; imageUrl: string | null; tags: string[]; available: boolean;
  variants: { id: string; name: string; pricePaise: number }[];
  addonGroups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; pricePaise: number; veg: boolean }[] }[];
};

// Cart keys: a plain item id, or "itemId~variantId~addon1.addon2" for an item with a size / add-ons.
export const lineKey = (itemId: string, variantId: string | null, addonIds: string[]) =>
  !variantId && !addonIds.length ? itemId : `${itemId}~${variantId || ''}~${[...addonIds].sort().join('.')}`;
export function parseKey(k: string) {
  const [itemId, v = '', a = ''] = k.split('~');
  return { itemId, variantId: v || null, addonIds: a ? a.split('.') : [] };
}
/** Unit price and label of a cart line, or null if the size / add-on no longer exists. */
export function lineInfo(item: Item, key: string) {
  const { variantId, addonIds } = parseKey(key);
  const v = variantId ? item.variants?.find(x => x.id === variantId) : null;
  if (variantId && !v) return null;
  if (!variantId && item.variants?.length) return null;
  const opts = (item.addonGroups || []).flatMap(g => g.options);
  const adds = addonIds.map(id => opts.find(o => o.id === id));
  if (adds.some(a => !a)) return null;
  const extra = [v?.name, ...adds.map(a => a!.name)].filter(Boolean).join(', ');
  return { unitPaise: (v ? v.pricePaise : item.pricePaise) + adds.reduce((x, a) => x + a!.pricePaise, 0), extra, variantId, addonIds };
}
export const hasOpts = (i: Item) => !!(i.variants?.length || i.addonGroups?.length);
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
