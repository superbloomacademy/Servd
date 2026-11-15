// Visit sessions: the rules that decide WHEN a QR scan may place orders.
// This is what stops "ordering from home" with an old link:
//  - theaters: only while a show is running on that seat's screen
//  - restaurants/cafés with a running bill: only while the table's session is open
//  - everything else: only during opening hours
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { VenueSettings } from '@/db/schema';
import { ApiError, notFound } from './api';
import { hhmmToMin, localParts } from './util';

type Venue = typeof schema.venues.$inferSelect;
type Spot = typeof schema.spots.$inferSelect;
type Show = typeof schema.shows.$inferSelect;

export type ShowNow = {
  movie: string; time: string; started: boolean;
  minutesToInterval: number; minutesToEnd: number; intervalAt: Date; endsAt: Date;
};

export function showNow(shows: Show[], settings: VenueSettings, at = new Date()): ShowNow | null {
  const { minutes } = localParts(at);
  let best: ShowNow | null = null;
  for (const s of shows) {
    const start = hhmmToMin(s.time);
    // handle shows that started before midnight and run past it
    for (const offset of [0, -1440]) {
      const st = start + offset;
      const end = st + s.durationMin;
      if (minutes >= st - settings.showWindowBeforeMin && minutes <= end) {
        const toEnd = end - minutes;
        best = {
          movie: s.movie, time: s.time, started: minutes >= st,
          minutesToInterval: st + s.intervalAfterMin - minutes, minutesToEnd: toEnd,
          intervalAt: new Date(at.getTime() + (st + s.intervalAfterMin - minutes) * 60e3),
          endsAt: new Date(at.getTime() + toEnd * 60e3),
        };
      }
    }
  }
  return best;
}

function closingTime(venue: Venue, at = new Date()) {
  const { minutes } = localParts(at);
  const open = hhmmToMin(venue.openTime), close = hhmmToMin(venue.closeTime);
  const overnight = close <= open;
  const isOpenNow = overnight ? minutes >= open || minutes < close : minutes >= open && minutes < close;
  if (!isOpenNow) return null;
  const minsLeft = overnight && minutes >= open ? 1440 - minutes + close : close - minutes;
  return new Date(at.getTime() + minsLeft * 60e3);
}

export type Window = { open: true; until: Date; show: ShowNow | null } | { open: false; reason: string; show: ShowNow | null };

export async function orderingWindow(venue: Venue, spot: Spot, vendorStatus: string): Promise<Window> {
  if (vendorStatus !== 'active') return { open: false, reason: 'Ordering is not available here right now.', show: null };
  if (!venue.isOpen) return { open: false, reason: `${venue.name} is not taking orders right now.`, show: null };
  if (!spot.active) return { open: false, reason: 'This QR code is switched off. Please ask the staff.', show: null };

  if (venue.serviceMode === 'seat_delivery' && spot.areaId) {
    const shows = await db().select().from(schema.shows).where(eq(schema.shows.areaId, spot.areaId));
    const show = showNow(shows, venue.settings);
    if (!show) return { open: false, reason: 'There is no show running at this seat right now. Ordering opens 30 minutes before the next show.', show: null };
    const pause = venue.settings.pauseLastMin || 0;
    if (pause && show.minutesToEnd <= pause) return { open: false, reason: 'Ordering has closed for this show.', show };
    return { open: true, until: new Date(show.endsAt.getTime() - pause * 60e3), show };
  }
  const until = closingTime(venue);
  if (!until) return { open: false, reason: `${venue.name} is closed now. Opening hours: ${venue.openTime} – ${venue.closeTime}.`, show: null };
  return { open: true, until, show: null };
}

export const usesTableSession = (v: Venue) => v.serviceMode === 'table_bill';

// Called every time the QR page loads (a scan, or reopening the link).
export async function startOrRefreshVisit(code: string, visitId: string | null, customerId: string | null) {
  const rows = await db().select({ spot: schema.spots, venue: schema.venues, vendor: schema.vendors })
    .from(schema.spots)
    .innerJoin(schema.venues, eq(schema.spots.venueId, schema.venues.id))
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id))
    .where(eq(schema.spots.code, code.toLowerCase()));
  const r = rows[0];
  if (!r) throw notFound('This QR code is not valid. Please scan the QR code at your seat or table again.');
  const { spot, venue, vendor } = r;
  const win = await orderingWindow(venue, spot, vendor.status);
  if (!win.open) return { spot, venue, vendor, window: win, visit: null, tableSession: null };

  // Running bill: join the table's open session, or open a new one.
  let tableSession: typeof schema.tableSessions.$inferSelect | null = null;
  if (usesTableSession(venue)) {
    const open = await db().select().from(schema.tableSessions)
      .where(and(eq(schema.tableSessions.spotId, spot.id), inArray(schema.tableSessions.status, ['open', 'bill_requested'])));
    tableSession = open[0] ?? (await db().insert(schema.tableSessions).values({ venueId: venue.id, spotId: spot.id }).returning())[0];
  }

  const maxEnd = new Date(Date.now() + venue.settings.sessionHours * 3600e3);
  const expiresAt = win.until < maxEnd ? win.until : maxEnd;

  let visit: typeof schema.visits.$inferSelect | null = null;
  if (visitId && /^[0-9a-f-]{36}$/.test(visitId)) {
    const v = (await db().select().from(schema.visits).where(eq(schema.visits.id, visitId)))[0];
    if (v && v.spotId === spot.id && v.expiresAt > new Date() && (!tableSession || v.tableSessionId === tableSession.id)) {
      visit = (await db().update(schema.visits).set({ lastScanAt: new Date(), customerId: customerId ?? v.customerId })
        .where(eq(schema.visits.id, v.id)).returning())[0];
    }
  }
  if (!visit) {
    visit = (await db().insert(schema.visits).values({
      venueId: venue.id, spotId: spot.id, customerId, tableSessionId: tableSession?.id ?? null, expiresAt,
    }).returning())[0];
  }
  return { spot, venue, vendor, window: win, visit, tableSession };
}

// Checked when placing an order.
export async function requireValidVisit(visitId: string, customerId: string) {
  if (!/^[0-9a-f-]{36}$/.test(visitId || '')) throw new ApiError(400, 'Scan the QR code at your seat or table to order.', 'RESCAN');
  const rows = await db().select({ visit: schema.visits, spot: schema.spots, venue: schema.venues, vendor: schema.vendors })
    .from(schema.visits)
    .innerJoin(schema.spots, eq(schema.visits.spotId, schema.spots.id))
    .innerJoin(schema.venues, eq(schema.visits.venueId, schema.venues.id))
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id))
    .where(eq(schema.visits.id, visitId));
  const r = rows[0];
  if (!r || r.visit.expiresAt < new Date()) throw new ApiError(400, 'Your session has ended. Scan the QR code at your seat or table again to order.', 'RESCAN');
  const ageMin = (Date.now() - r.visit.lastScanAt.getTime()) / 60e3;
  if (ageMin > r.venue.settings.rescanMinutes) throw new ApiError(400, 'Please scan the QR code at your seat or table again before ordering.', 'RESCAN');
  const win = await orderingWindow(r.venue, r.spot, r.vendor.status);
  if (!win.open) throw new ApiError(400, win.reason, 'CLOSED');
  let tableSession = null;
  if (r.visit.tableSessionId) {
    tableSession = (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, r.visit.tableSessionId)))[0];
    if (!tableSession || tableSession.status === 'closed') throw new ApiError(400, 'This table’s bill is closed. Scan the QR code again to start a new order.', 'RESCAN');
  }
  if (r.visit.customerId !== customerId) await db().update(schema.visits).set({ customerId }).where(eq(schema.visits.id, visitId));
  return { ...r, window: win, tableSession };
}
