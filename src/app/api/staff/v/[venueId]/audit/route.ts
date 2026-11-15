import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.reports);
  const rows = await db().select().from(schema.auditLog).where(eq(schema.auditLog.venueId, venueId)).orderBy(desc(schema.auditLog.at)).limit(200);
  return { entries: rows };
});
