import { sql } from 'drizzle-orm';
import { db } from '@/db';

// For the hosting service's health check: is the app up and can it reach the database?
export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true, at: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false, error: 'database unreachable' }, { status: 503 });
  }
}
