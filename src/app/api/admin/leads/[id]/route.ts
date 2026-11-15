import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { LeadInput } from '@/lib/admin';

const find = async (id: string) => {
  const l = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.leads).where(eq(schema.leads.id, id)))[0] : null;
  if (!l) throw notFound('Lead not found');
  return l;
};

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  await requireStaff(['super_admin']);
  await find(id);
  const sent = await body<Record<string, unknown>>(req);
  const b = LeadInput.partial().parse(sent);
  // .partial() still fills defaults; only apply the fields that were actually sent.
  const set = Object.fromEntries(Object.entries(b).filter(([k]) => k in sent));
  const [lead] = await db().update(schema.leads).set({ ...set, updatedAt: new Date() }).where(eq(schema.leads.id, id)).returning();
  return { lead };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await requireStaff(['super_admin']);
  await find(id);
  await db().delete(schema.leads).where(eq(schema.leads.id, id));
  return { ok: true };
});
