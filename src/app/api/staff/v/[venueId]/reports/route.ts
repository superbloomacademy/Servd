import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { dayReport } from '@/lib/reports';
import { localParts } from '@/lib/util';

// Day-end (Z) report. ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: today).
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, [...CAN.reports, 'cashier']);
  const q = new URL(req.url).searchParams;
  const today = localParts().date;
  return dayReport(venueId, q.get('from') || today, q.get('to') || q.get('from') || today);
});
