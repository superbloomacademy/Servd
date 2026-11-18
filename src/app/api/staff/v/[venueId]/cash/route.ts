import { body, bad, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { addCashEntry, closeShift, drawer, openShift } from '@/lib/cash';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.cash);
  return drawer(venueId);
});

// { action: 'open', openingPaise } | { action: 'entry', kind, amountPaise, category, note } | { action: 'close', countedPaise, note }
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.cash);
  const b = await body<{ action: string; openingPaise?: number; countedPaise?: number; kind?: 'in' | 'out' | 'expense'; amountPaise?: number; category?: string; note?: string }>(req);
  if (b.action === 'open') return { shift: await openShift(venueId, s, Number(b.openingPaise)) };
  if (b.action === 'entry') return { entry: await addCashEntry(venueId, s, { kind: b.kind!, amountPaise: Number(b.amountPaise), category: b.category, note: b.note }) };
  if (b.action === 'close') return { result: await closeShift(venueId, s, Number(b.countedPaise), String(b.note || '')) };
  throw bad('Unknown action');
});
