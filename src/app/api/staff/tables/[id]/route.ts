import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { closeTable, tableBill } from '@/lib/orders';

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

// Cashier/captain confirms the bill is paid (UPI received or cash) and closes the table.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const t = await load(id);
  const s = await requireVenueAccess(t.venueId, CAN.tables);
  const b = await body<{ method: 'upi_shop' | 'cash' }>(req);
  if (!['upi_shop', 'cash'].includes(b.method)) throw bad('Choose UPI or cash');
  await closeTable(id, s, b.method);
  return { ok: true };
});
