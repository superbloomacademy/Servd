export type Role = 'super_admin' | 'owner' | 'manager' | 'cashier' | 'station' | 'captain' | 'runner';
export type Me = {
  staff: { id: string; name: string; phone: string; role: Role; vendorId: string | null; venueId: string | null; stationId: string | null; stationName: string | null };
  venues: { id: string; name: string; type: string; serviceMode: string; vendorId: string; vendor: { name: string; logoUrl: string | null; brandColor: string; stage: 'setup' | 'live' } }[];
};
export type Kot = { id: string; orderId: string; stationId: string | null; stationName: string; status: 'held' | 'new' | 'preparing' | 'ready'; createdAt: string; startedAt: string | null; readyAt: string | null };
export type Order = {
  id: string; venueId: string; kotNo: number; status: 'awaiting_payment' | 'confirmed' | 'preparing' | 'ready' | 'out' | 'delivered' | 'cancelled' | 'rejected';
  payStatus: 'unpaid' | 'claimed' | 'paid' | 'on_bill'; payMethod: 'upi_shop' | 'cash' | 'bill' | null; utrLast4: string | null;
  fulfilment: 'seat' | 'table' | 'pickup'; deliverAt: 'now' | 'interval'; releaseAt: string | null; showLabel: string | null; spotLabel: string;
  totalPaise: number; subtotalPaise: number; discountPaise: number; taxPaise: number; couponCode: string | null; note: string; rejectReason: string | null;
  timeline: { status: string; at: string; by?: string }[]; createdAt: string; tableSessionId: string | null;
  items: { id: string; name: string; qty: number; pricePaise: number; veg: boolean; stationId: string | null }[]; kots: Kot[];
};
export type TableBill = {
  session: { id: string; spotId: string; status: 'open' | 'bill_requested' | 'closed'; payStatus: 'unpaid' | 'claimed' | 'paid'; payMethod: 'upi_shop' | 'cash' | null; utrLast4: string | null; openedAt: string; billRequestedAt: string | null };
  spotLabel: string; totalPaise: number; subtotalPaise: number; taxPaise: number; discountPaise: number;
  rounds: { id: string; kotNo: number; status: string; createdAt: string; totalPaise: number; items: { name: string; qty: number; pricePaise: number; veg: boolean }[] }[];
};
export type ServiceRequest = { id: string; spotId: string; tableSessionId: string | null; kind: 'waiter' | 'water' | 'bill'; createdAt: string; spotLabel: string };
export type Live = { orders: Order[]; tables: TableBill[]; requests: ServiceRequest[] };
export type VenueCtx = { id: string; name: string; type: string; serviceMode: string; vendorId: string; brandColor: string };
