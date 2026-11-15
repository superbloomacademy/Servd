import { desc } from 'drizzle-orm';
import { LeadInput } from '@/lib/admin';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';


export const GET = route(async () => {
  await requireStaff(['super_admin']);
  return { leads: await db().select().from(schema.leads).orderBy(desc(schema.leads.updatedAt)) };
});

export const POST = route(async req => {
  await requireStaff(['super_admin']);
  const b = LeadInput.parse(await body(req));
  const [lead] = await db().insert(schema.leads).values(b).returning();
  return { lead };
});
