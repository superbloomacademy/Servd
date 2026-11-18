'use client';
import { useRef, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api, rupee } from '@/lib/client';
import { Btn, Sheet, VegMark } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';

type Row = { category: string; name: string; pricePaise: number; veg: boolean; station: string; description: string };
const TEMPLATE = 'Category,Item,Price,Veg (yes/no),Kitchen station,Description\nStarters,Paneer Tikka,240,yes,Tandoor,Smoky cottage cheese\nStarters,Chicken 65,260,no,Kitchen,\nBeverages,Masala Chai,40,yes,Bar,\n';

/** Small CSV reader: commas, quotes, "" inside quotes, CRLF. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

function toRows(text: string): { rows: Row[]; errors: string[] } {
  const all = parseCsv(text.replace(/^﻿/, ''));
  if (!all.length) return { rows: [], errors: ['The file is empty.'] };
  const head = all[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.some(n => h.startsWith(n)));
  const ci = col('category'), ni = col('item', 'name'), pi = col('price'), vi = col('veg', 'type'), si = col('kitchen', 'station'), di = col('desc');
  if (ci < 0 || ni < 0 || pi < 0) return { rows: [], errors: ['The first row must have the columns Category, Item and Price. Download the template to see the format.'] };
  const rows: Row[] = [], errors: string[] = [];
  all.slice(1).forEach((r, i) => {
    const name = (r[ni] || '').trim(), category = (r[ci] || '').trim(), price = Number(String(r[pi] || '').replace(/[^\d.]/g, ''));
    if (!name && !category) return;
    if (!name || !category || !(price >= 1)) { errors.push(`Row ${i + 2}: needs a category, an item name and a price.`); return; }
    const veg = vi < 0 ? true : !/^(n|no|non|non-veg|nonveg|nv|0|false)$/i.test((r[vi] || '').trim());
    rows.push({ category, name, pricePaise: Math.round(price * 100), veg, station: si < 0 ? '' : (r[si] || '').trim(), description: di < 0 ? '' : (r[di] || '').trim() });
  });
  return { rows, errors };
}

// Upload a whole menu from Excel (saved as CSV). Same-name items get their price updated.
export function MenuImport({ open, onClose, venueId, onDone }: { open: boolean; onClose: () => void; venueId: string; onDone: () => void }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ rows: Row[]; errors: string[]; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv' }));
    a.download = 'servd-menu-template.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const read = async (f: File) => {
    if (!/\.(csv|txt)$/i.test(f.name)) { toast('Save the Excel sheet as “CSV (Comma delimited)” and choose that file.', 'bad'); return; }
    setParsed({ ...toRows(await f.text()), name: f.name });
  };
  const upload = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true);
    try {
      const r = await api<{ added: number; updated: number }>(`/api/staff/v/${venueId}/menu/import`, { body: { rows: parsed.rows } });
      toast(`${r.added} items added, ${r.updated} updated`); setParsed(null); onDone(); onClose();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={() => { setParsed(null); onClose(); }} title="Upload menu from Excel" wide
      footer={parsed?.rows.length ? <Btn tone="dark" size="lg" className="w-full" loading={busy} onClick={upload}>Upload {parsed.rows.length} items</Btn> : undefined}>
      <div className="space-y-4 p-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-ink-2">
          <li>Download the template and open it in Excel or Google Sheets.</li>
          <li>One row per item: category, item, price, veg yes/no, kitchen station (optional), description (optional).</li>
          <li>Save as <b>CSV</b> and choose the file below. Items that already exist (same name, same category) get the new price.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Btn tone="outline" onClick={template}><Download size={16} />Download template</Btn>
          <Btn tone="dark" onClick={() => file.current?.click()}><FileSpreadsheet size={16} />Choose CSV file</Btn>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
        </div>
        {parsed && (
          <div>
            <p className="font-semibold">{parsed.name}: {parsed.rows.length} items ready{parsed.errors.length ? `, ${parsed.errors.length} rows skipped` : ''}</p>
            {parsed.errors.length > 0 && <ul className="mt-2 space-y-0.5 rounded-xl bg-[#FFF3E0] p-3 text-xs text-[#9A5500]">{parsed.errors.slice(0, 8).map(e => <li key={e}>{e}</li>)}</ul>}
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-xs"><tbody>
                {parsed.rows.slice(0, 200).map((r, i) => <tr key={i} className="border-b border-line last:border-0"><td className="px-3 py-1.5 text-muted">{r.category}</td><td className="flex items-center gap-1.5 py-1.5"><VegMark veg={r.veg} size={10} />{r.name}</td><td className="tabular px-3 text-right">{rupee(r.pricePaise)}</td><td className="pr-3 text-muted">{r.station}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
