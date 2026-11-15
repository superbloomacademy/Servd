// Servd local server (this PC / any normal Node host): starts PostgreSQL (if no DATABASE_URL), runs migrations,
// seeds demo data, serves the Next.js app and runs the background jobs every 30 s.
// On Vercel this file isn't used: scripts/migrate.ts runs at build time and jobs run from /api/rt and /api/cron/jobs.
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import next from 'next';

const ROOT = process.cwd();
const dev = process.env.NODE_ENV !== 'production';
loadEnv();
const PORT = Number(process.env.PORT || 3000);

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]] && m[2] !== '') process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) return n.address;
  return 'localhost';
}

let embedded: { stop: () => Promise<void> } | null = null;

async function startLocalPostgres() {
  const url = 'postgres://servd:servd@localhost:54329/servd';
  // If our local database is still running from an earlier session (e.g. the window was closed), reuse it.
  try {
    const { default: pgLib } = await import('pg');
    const c = new pgLib.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
    await c.connect(); await c.end();
    process.env.DATABASE_URL = url;
    return;
  } catch { /* not running: start it */ }
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = path.join(ROOT, '.data', 'pg');
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'servd', password: 'servd', port: 54329, persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, onError: (e: unknown) => console.error('[postgres]', String(e).trim()),
  });
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
    console.log('  Setting up the local database (first run only)…');
    await pg.initialise();
  }
  await pg.start();
  try { await pg.createDatabase('servd'); } catch { /* already exists */ }
  embedded = pg;
  process.env.DATABASE_URL = url;
}

async function main() {
  if (!process.env.DATABASE_URL) await startLocalPostgres();
  if (!process.env.PUBLIC_BASE_URL) process.env.PUBLIC_BASE_URL = `http://${lanIp()}:${PORT}`;

  const { db } = await import('./src/db/index');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(db(), { migrationsFolder: path.join(ROOT, 'drizzle') });
  const { seedIfEmpty } = await import('./src/db/seed');
  await seedIfEmpty();
  const { backfillInvoices } = await import('./src/lib/invoices');
  await backfillInvoices();

  const app = next({ dev, dir: ROOT });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => handle(req, res));

  // Background jobs: auto-cancel unpaid orders, release interval orders to the kitchen.
  const { runJobs } = await import('./src/lib/jobs');
  setInterval(() => runJobs().catch(e => console.error('[jobs]', e)), 30_000);
  runJobs().catch(() => {});

  server.listen(PORT, () => {
    console.log(`\n  Servd is running\n`);
    console.log(`  Home / demo links   http://localhost:${PORT}`);
    console.log(`  Staff & owner login http://localhost:${PORT}/staff/login`);
    console.log(`  Super admin         http://localhost:${PORT}/admin`);
    console.log(`  Phones on Wi-Fi     ${process.env.PUBLIC_BASE_URL}\n`);
  });

  const shutdown = async () => {
    server.close();
    if (embedded) await embedded.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async e => {
  console.error(e);
  if (embedded) await embedded.stop().catch(() => {});
  process.exit(1);
});
