import { body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { claimPaid, customerView } from '@/lib/orders';

// Customer says "I've paid" (UPI to the shop). Staff still have to confirm it.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const c = await requireCustomer();
  const b = await body<{ utr?: string }>(req);
  const o = await claimPaid(id, c.id, b.utr);
  return { order: customerView(o) };
});
