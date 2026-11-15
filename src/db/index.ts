import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

// One pool per process, shared by the custom server and Next.js route handlers.
const g = globalThis as unknown as { __servdPool?: pg.Pool; __servdDb?: DB };

export function db(): DB {
  if (!g.__servdDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Start the app with `npm run dev`.');
    // Vercel runs many small copies of the app, so each keeps only a few connections (use Neon's pooled URL).
    g.__servdPool = process.env.VERCEL
      ? new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 })
      : new pg.Pool({ connectionString: url, max: 10 });
    g.__servdDb = drizzle(g.__servdPool, { schema });
  }
  return g.__servdDb;
}

export { schema };
