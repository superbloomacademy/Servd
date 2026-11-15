import { db, schema } from '@/db';
import { bad, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { randomCode } from '@/lib/util';

const TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

// Logo / food photo upload. The browser shrinks photos first (see shrinkImage), so they are small.
// Stored in the database, so it works the same on this PC and on Vercel. Served at /uploads/<name>.
export const POST = route(async req => {
  await requireStaff(['owner', 'manager']);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw bad('Choose an image to upload');
  const ext = TYPES[file.type];
  if (!ext) throw bad('Use a PNG, JPG or WebP image');
  if (file.size > 3 * 1024 * 1024) throw bad('Image must be smaller than 3 MB');
  const name = `${Date.now()}-${randomCode(10)}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await db().insert(schema.uploads).values({ name, contentType: file.type, bytes, size: bytes.length });
  return { url: `/uploads/${name}` };
});
