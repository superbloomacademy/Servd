export type Role = 'super_admin' | 'owner' | 'manager' | 'cashier' | 'station' | 'captain' | 'runner';
export type Me = {
  staff: { id: string; name: string; phone: string; role: Role; vendorId: string | null; venueId: string | null; stationId: string | null; stationName: string | null };
  venues: { id: string; name: string; type: string; serviceMode: string; vendorId: string; vendor: { name: string; logoUrl: string | null; brandColor: string; stage: 'setup' | 'live'; isDemo?: boolean; features: { pos: boolean; inventory: boolean; customers: boolean } } }[];
};
export type Kot = { id: string; orderId: string; stationId: string | null; stationName: string; status: 'held' | 'new' | 'preparing' | 'ready'; createdAt: string; startedAt: string | null; readyAt: string | null };
export type Order = {
  id: string; venueId: string; kotNo: number; status: 'awaiting_payment' | 'confirmed' | 'preparing' | 'ready' | 'out' | 'delivered' | 'cancelled' | 'rejected';
  payStatus: 'unpaid' | 'claimed' | 'paid' | 'on_bill'; payMethod: PayMethod | null; utrLast4: string | null;
  fulfilment: 'seat' | 'table' | 'pickup' | 'delivery'; channel: Channel; guestName: string; guestPhone: string; deliveryAddress: string;
  externalRef: string | null; payments: Payment[]; discountReason: string | null; roundOffPaise: number; billDiscountPaise: number; deliverAt: 'now' | 'interval'; releaseAt: string | null; showLabel: string | null; spotLabel: string;
  totalPaise: number; subtotalPaise: number; discountPaise: number; taxPaise: number; couponCode: string | null; note: string; rejectReason: string | null;
  timeline: { status: string; at: string; by?: string }[]; createdAt: string; tableSessionId: string | null;
  items: { id: string; name: string; qty: number; pricePaise: number; veg: boolean; stationId: string | null; note: string; variantName: string | null; addons: { name: string; pricePaise: number }[] }[]; kots: Kot[];
};
export type PayMethod = 'upi_shop' | 'cash' | 'bill' | 'card' | 'online' | 'split';
export type Payment = { method: 'upi_shop' | 'cash' | 'card' | 'online'; amountPaise: number };
export type Channel = 'qr' | 'pos' | 'zomato' | 'swiggy' | 'phone' | 'other';
/** A guest's first QR order at a table: staff must accept it before the kitchen gets it. */
export const needsAccept = (o: Order) => o.payStatus === 'on_bill' && !o.releaseAt && !['cancelled', 'rejected'].includes(o.status) && o.kots.length > 0 && o.kots.every(k => k.status === 'held');
export type TableBill = {
  session: { id: string; spotId: string; status: 'open' | 'bill_requested' | 'closed'; payStatus: 'unpaid' | 'claimed' | 'paid'; payMethod: PayMethod | null; utrLast4: string | null; openedAt: string; billRequestedAt: string | null; guests: number };
  spotLabel: string; totalPaise: number; subtotalPaise: number; taxPaise: number; discountPaise: number; roundOffPaise: number; duePaise: number;
  rounds: { awaitingStaff: boolean; id: string; kotNo: number; status: string; createdAt: string; totalPaise: number; payStatus: string; channel: Channel; discountReason: string | null;
    items: { id: string; name: string; qty: number; pricePaise: number; veg: boolean; note: string; itemId: string | null; variantId: string | null; addonIds: string[] }[] }[];
};
export type ServiceRequest = { id: string; spotId: string; tableSessionId: string | null; kind: 'waiter' | 'water' | 'bill'; createdAt: string; spotLabel: string };
export type Live = { venueId?: string; orders: Order[]; tables: TableBill[]; requests: ServiceRequest[] };
export type VenueCtx = { id: string; name: string; type: string; serviceMode: string; vendorId: string; brandColor: string };

/** Menu as the billing screen needs it. */
export type ItemVariant = { id: string; name: string; pricePaise: number };
export type AddonGroup = { id: string; name: string; min: number; max: number; options: { id: string; name: string; pricePaise: number; veg: boolean }[] };
export type MenuItemFull = {
  id: string; categoryId: string; stationId: string | null; name: string; description: string; pricePaise: number; veg: boolean; imageUrl: string | null;
  isLive: boolean; tags: string[]; variants: ItemVariant[]; addonGroups: AddonGroup[]; sort: number; shortCode: string; favourite: boolean;
};
export type MenuData = { categories: { id: string; name: string; isLive: boolean }[]; items: MenuItemFull[]; stations: { id: string; name: string; isLive: boolean }[] };
export const PAY_LABEL: Record<string, string> = { upi_shop: 'UPI', cash: 'Cash', card: 'Card', online: 'Paid online', split: 'Split', bill: 'Table bill' };
export const CHANNEL_LABEL: Record<Channel, string> = { qr: 'QR', pos: 'Counter', zomato: 'Zomato', swiggy: 'Swiggy', phone: 'Phone', other: 'Other app' };
