import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { emit } from '@/lib/realtime';

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const r = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, id)))[0] : null;
  if (!r) throw notFound();
  await requireVenueAccess(r.venueId);
  await db().update(schema.serviceRequests).set({ status: 'done' }).where(eq(schema.serviceRequests.id, id));
  emit(`venue:${r.venueId}`, 'request', { id, done: true });
  return { ok: true };
});
