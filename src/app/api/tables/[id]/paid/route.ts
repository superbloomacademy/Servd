import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { broadcastTable, tableBill } from '@/lib/orders';
import { requireTableMember } from '@/lib/tables';

// Customer says the table bill is paid (UPI to the venue). The cashier confirms and closes the table.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const c = await requireCustomer();
  await requireTableMember(id, c.id);
  const b = await body<{ utr?: string }>(req);
  const bill = await tableBill(id);
  if (bill.session.status !== 'bill_requested') throw bad('Request the bill first.');
  await db().update(schema.tableSessions).set({
    payStatus: 'claimed', utrLast4: b.utr ? String(b.utr).replace(/\D/g, '').slice(-4) || null : null,
  }).where(eq(schema.tableSessions.id, id));
  await broadcastTable(id, 'payment_claim');
  return tableBill(id);
});
