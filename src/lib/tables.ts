import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { notFound } from './api';

// A customer may see a table's bill only if they scanned that table during this session.
export async function requireTableMember(tableSessionId: string, customerId: string) {
  if (!/^[0-9a-f-]{36}$/.test(tableSessionId)) throw notFound('Bill not found');
  const v = await db().select({ id: schema.visits.id }).from(schema.visits)
    .where(and(eq(schema.visits.tableSessionId, tableSessionId), eq(schema.visits.customerId, customerId)));
  if (!v[0]) throw notFound('Bill not found. Scan the QR code on your table.');
}
