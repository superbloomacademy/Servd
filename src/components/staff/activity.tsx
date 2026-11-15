'use client';
import { useEffect, useState } from 'react';
import { api, timeAgo } from '@/lib/client';
import { Empty, Spinner } from '@/components/ui/kit';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Entry = { id: number; staffName: string | null; action: string; entity: string; entityId: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string };

const LABEL: Record<string, string> = {
  upi_payment_confirmed: 'confirmed a UPI payment', cash_received: 'confirmed cash received', order_rejected: 'rejected an order',
  item_turned_off: 'turned off an item', item_turned_on: 'turned on an item', category_turned_off: 'turned off a category', category_turned_on: 'turned on a category',
  station_turned_off: 'turned off a station', station_turned_on: 'turned on a station', item_edited: 'edited an item', item_created: 'added an item', item_deleted: 'deleted an item',
  table_closed_upi: 'closed a table (UPI)', table_closed_cash: 'closed a table (cash)', qr_code_replaced: 'replaced a QR code', qr_turned_off: 'switched off a QR', qr_turned_on: 'switched on a QR',
  venue_paused: 'paused all orders', venue_opened: 'started taking orders', venue_settings_changed: 'changed venue settings', area_created: 'added seats/tables', area_edited: 'edited a screen/area',
  category_created: 'added a category', station_created: 'added a station',
};

function detail(e: Entry) {
  const a = e.after || {}, b = e.before || {};
  if (a.kotNo) return `KOT ${a.kotNo}${a.amountPaise ? ` · ₹${Number(a.amountPaise) / 100}` : ''}${a.reason ? ` · “${a.reason}”` : ''}`;
  if (a.pricePaise !== undefined && b.pricePaise !== undefined) return `Price ₹${Number(b.pricePaise) / 100} → ₹${Number(a.pricePaise) / 100}`;
  if (a.label) return String(a.label);
  if (a.billNo) return `Bill ${a.billNo} · ${a.spot} · ₹${Number(a.totalPaise) / 100}`;
  if (a.name) return String(a.name);
  return '';
}

// Who did what, and when. Every confirmed action is recorded.
export function Activity({ venue }: { venue: VenueCtx }) {
  const [list, setList] = useState<Entry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    api<{ entries: Entry[] }>(`/api/staff/v/${venue.id}/audit`).then(r => setList(r.entries));
    api<{ items: { id: string; name: string }[]; categories: { id: string; name: string }[]; stations: { id: string; name: string }[] }>(`/api/staff/v/${venue.id}/menu`)
      .then(m => setNames(Object.fromEntries([...m.items, ...m.categories, ...m.stations].map(x => [x.id, x.name]))));
  }, [venue.id]);
  return (
    <div className="max-w-3xl">
      <PageHead title="Activity log" sub="Every payment confirmation, rejection, item on/off, price change and setting change, with who did it." />
      {!list ? <Spinner className="text-muted" /> : !list.length ? <div className="rounded-2xl bg-white"><Empty title="No activity yet" /></div> : (
        <ol className="divide-y divide-line rounded-2xl bg-white">
          {list.map(e => (
            <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div><b>{e.staffName || 'System'}</b> {LABEL[e.action] || e.action.replace(/_/g, ' ')}
                <p className="text-xs text-muted">{(e.entityId && names[e.entityId]) || detail(e)}</p></div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
