import { route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { tableBill } from '@/lib/orders';
import { requireTableMember } from '@/lib/tables';

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const c = await requireCustomer();
  await requireTableMember(id, c.id);
  return tableBill(id);
});
