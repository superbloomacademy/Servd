// Runs before every Vercel build (npm run vercel-build): updates the database tables and, on a brand-new
// live database, creates only our super admin (SEED_DEMO=false + ADMIN_PHONE + ADMIN_PIN). Safe to run many times.
import path from 'node:path';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. In Vercel: Storage → connect the Neon database to this project.');
  const { db } = await import('../src/db/index');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(db(), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  console.log('  Database tables are up to date.');
  const { seedIfEmpty } = await import('../src/db/seed');
  await seedIfEmpty();
  const { backfillInvoices } = await import('../src/lib/invoices');
  await backfillInvoices();
  process.exit(0);
}
main().catch(e => { console.error('\n  Database setup failed:', e.message || e); process.exit(1); });
