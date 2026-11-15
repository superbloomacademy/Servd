import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { vendorIdFor } from '@/lib/vendor-access';
import { monthlyDues, thisMonth } from '@/lib/admin';

// Owner: our monthly bills to them, plus what this month comes to so far.
export const GET = route(async req => {
  const s = await requireStaff(['owner']);
  const vendorId = vendorIdFor(s, req);
  const bills = await db().select().from(schema.platformBills).where(eq(schema.platformBills.vendorId, vendorId)).orderBy(desc(schema.platformBills.month));
  const now = (await monthlyDues(thisMonth())).get(vendorId) ?? null;
  return { bills, thisMonth: now };
});
