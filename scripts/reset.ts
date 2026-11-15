// Deletes the local database and uploads so the next `npm run dev` starts with fresh demo data.
// Stop the server first (Ctrl+C).
import fs from 'node:fs';
import path from 'node:path';

for (const d of ['pg', 'uploads']) {
  const p = path.join(process.cwd(), '.data', d);
  if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log(`Removed ${path.relative(process.cwd(), p)}`); }
}
console.log('Done. Run `npm run dev` to start with fresh demo data.');
