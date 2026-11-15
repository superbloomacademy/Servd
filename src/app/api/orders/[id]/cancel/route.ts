import { route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { customerCancel, customerView } from '@/lib/orders';

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const c = await requireCustomer();
  return { order: customerView(await customerCancel(id, c.id)) };
});
