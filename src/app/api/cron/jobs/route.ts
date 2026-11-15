import { route, unauthorized } from '@/lib/api';
import { runJobs } from '@/lib/jobs';

// Optional outside timer (e.g. cron-job.org every minute, or Vercel Cron). Protected by CRON_SECRET.
export const GET = route(async req => {
  const want = process.env.CRON_SECRET;
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('key');
  if (!want || got !== want) throw unauthorized('Wrong or missing key');
  await runJobs();
  return { ok: true };
});
