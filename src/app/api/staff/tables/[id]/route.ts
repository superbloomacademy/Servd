import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { closeTable, tableBill } from '@/lib/orders';
import { applyDiscount, freeEmptyTable, mergeTables, moveTable, setGuests, type Discount } from '@/lib/pos';
import type { Payment, StaffRole } from '@/db/schema';

async function load(id: string) {
  const t = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, id)))[0] : null;
  if (!t) throw notFound('Table bill not found');
  return t;
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const t = await load(id);
  await requireVenueAccess(t.venueId);
  return tableBill(id);
});

type Body = { action?: 'close' | 'discount' | 'move' | 'merge' | 'guests' | 'free'; method?: 'upi_shop' | 'cash'; payments?: Payment[];
  discount?: Discount; spotId?: string; intoId?: string; guests?: number };
const NEED: Record<NonNullable<Body['action']>, StaffRole[]> = {
  close: CAN.tables, discount: CAN.discount, move: CAN.tables, merge: CAN.tables, guests: CAN.tables, free: CAN.tables,
};

// Table actions. Default (no action) = close: the bill is paid (UPI / cash / card / split) and the table becomes free.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const t = await load(id);
  const b = await body<Body>(req);
  const action = b.action || 'close';
  if (!NEED[action]) throw bad('Unknown action');
  const s = await requireVenueAccess(t.venueId);
  if (s.role !== 'super_admin' && !NEED[action].includes(s.role)) throw forbidden('Your role cannot do this.');
  if (action === 'close') {
    if (Array.isArray(b.payments) && b.payments.length) await closeTable(id, s, b.payments);
    else if (b.method === 'upi_shop' || b.method === 'cash') await closeTable(id, s, b.method);
    else throw bad('Choose UPI or cash');
  }
  if (action === 'discount') { if (!b.discount) throw bad('Enter a discount'); await applyDiscount({ tableSessionId: id }, b.discount, s); }
  if (action === 'move') await moveTable(id, String(b.spotId || ''), s);
  if (action === 'merge') await mergeTables(id, String(b.intoId || ''), s);
  if (action === 'guests') await setGuests(id, Number(b.guests));
  if (action === 'free') await freeEmptyTable(id, s);
  return { ok: true };
});
