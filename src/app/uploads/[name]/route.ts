import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

const LOCAL: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

// Logos and food photos. Names never change, so browsers and Vercel's edge cache keep them for a year (fast menus).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = path.basename((await params).name);
  const row = (await db().select().from(schema.uploads).where(eq(schema.uploads.name, name)))[0];
  let bytes: Buffer | null = row ? Buffer.from(row.bytes) : null;
  let type = row?.contentType;
  if (!bytes) {
    // Photos uploaded before they were stored in the database (this PC only).
    try { bytes = await fs.readFile(path.join(process.cwd(), '.data', 'uploads', name)); type = LOCAL[path.extname(name).toLowerCase()]; }
    catch { return new Response('Not found', { status: 404 }); }
  }
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}
