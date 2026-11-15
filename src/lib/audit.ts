import { db, schema } from '@/db';
import type { Staff } from './auth';

// Every confirmed staff action is recorded: who, what, old value -> new value.
export async function audit(s: Staff | null, a: {
  action: string; entity: string; entityId?: string; venueId?: string | null; vendorId?: string | null; before?: unknown; after?: unknown;
}) {
  await db().insert(schema.auditLog).values({
    staffId: s?.id ?? null, staffName: s?.name ?? 'system', vendorId: a.vendorId ?? s?.vendorId ?? null,
    venueId: a.venueId ?? null, action: a.action, entity: a.entity, entityId: a.entityId ?? null,
    before: (a.before ?? null) as object, after: (a.after ?? null) as object,
  });
}
