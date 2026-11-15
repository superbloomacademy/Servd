import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { broadcastTable, tableBill } from '@/lib/orders';
import { requireTableMember } from '@/lib/tables';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const c = await requireCustomer();
  await requireTableMember(id, c.id);
  const b = await body<{ payMethod?: 'upi_shop' | 'cash' }>(req);
  const bill = await tableBill(id);
  if (bill.session.status === 'closed') throw bad('This bill is already settled.');
  if (!bill.rounds.length) throw bad('Nothing has been ordered on this table yet.');
  await db().update(schema.tableSessions).set({
    status: 'bill_requested', billRequestedAt: new Date(), payMethod: b.payMethod === 'cash' ? 'cash' : 'upi_shop',
  }).where(eq(schema.tableSessions.id, id));
  await db().insert(schema.serviceRequests).values({ venueId: bill.session.venueId, spotId: bill.session.spotId, tableSessionId: id, kind: 'bill' });
  await broadcastTable(id, 'bill_requested');
  return tableBill(id);
});
