import { bad, body, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { createDemo, demoVendors, refreshDemo, removeDemo } from '@/lib/demo';
import { isDemo } from '@/lib/mode';

// Creating the demo writes ~700 sample orders in batches; allow time on the live host.
export const maxDuration = 60;

export const GET = route(async () => {
  await requireStaff(['super_admin']);
  return { vendors: await demoVendors(), localDemoMode: isDemo() };
});

// { action: 'create' | 'refresh', pin } | { action: 'remove' }
export const POST = route(async req => {
  const s = await requireStaff(['super_admin']);
  const b = await body<{ action?: string; pin?: string }>(req);
  const pin = String(b.pin || '');
  if (b.action === 'create') await createDemo(s, pin);
  else if (b.action === 'refresh') await refreshDemo(s, pin);
  else if (b.action === 'remove') await removeDemo(s);
  else throw bad('Unknown action');
  return { vendors: await demoVendors() };
});
