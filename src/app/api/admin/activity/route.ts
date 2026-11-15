import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

// Platform-wide activity log (every confirmed action by any staff member, owner or us). Newest first, 100 per page.
export const GET = route(async req => {
  await requireStaff(['super_admin']);
  const p = new URL(req.url).searchParams;
  const vendorId = p.get('vendorId');
  const before = Number(p.get('before') || 0);
  const conds = [];
  if (vendorId && /^[0-9a-f-]{36}$/.test(vendorId)) conds.push(eq(schema.auditLog.vendorId, vendorId));
  if (before > 0) conds.push(lt(schema.auditLog.id, before));
  const rows = await db().select().from(schema.auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.auditLog.id)).limit(100);
  const vids = [...new Set(rows.map(r => r.vendorId).filter(Boolean))] as string[];
  const venIds = [...new Set(rows.map(r => r.venueId).filter(Boolean))] as string[];
  const [vendors, venues] = await Promise.all([
    vids.length ? db().select({ id: schema.vendors.id, name: schema.vendors.name }).from(schema.vendors).where(inArray(schema.vendors.id, vids)) : [],
    venIds.length ? db().select({ id: schema.venues.id, name: schema.venues.name }).from(schema.venues).where(inArray(schema.venues.id, venIds)) : [],
  ]);
  return {
    entries: rows.map(r => ({ ...r, vendorName: vendors.find(v => v.id === r.vendorId)?.name ?? '', venueName: venues.find(v => v.id === r.venueId)?.name ?? '' })),
    next: rows.length === 100 ? rows[rows.length - 1].id : null,
  };
});
