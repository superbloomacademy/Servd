import { bad, body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { requireFeature } from '@/lib/vendor-access';
import {
  cancelTransfer, closePurchase, countList, createPurchase, finishCount, inventoryOverview, paySupplier, produce, receivePurchase, receiveTransfer, savePrep, saveRecipe,
  saveStockItem, saveSupplier, sendTransfer, stockMove, stockReport, supplierLedger, transferList,
} from '@/lib/inventory';
import { localParts } from '@/lib/util';

// ?view=counts | transfers | supplier&id= | report&from=&to=   (default: the overview)
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.inventory);
  await requireFeature(venueId, 'inventory');
  const q = new URL(req.url).searchParams, today = localParts().date;
  switch (q.get('view')) {
    case 'counts': return { counts: await countList(venueId) };
    case 'transfers': return transferList(venueId);
    case 'supplier': return supplierLedger(venueId, String(q.get('id')));
    case 'report': return stockReport(venueId, q.get('from') || today, q.get('to') || today);
    default: return inventoryOverview(venueId);
  }
});

export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.inventory);
  await requireFeature(venueId, 'inventory');
  const b = await body<{ action: string; id?: string }>(req);
  const id = b.id && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null;
  switch (b.action) {
    case 'item': return { item: await saveStockItem(venueId, s, id, b) };
    case 'move': return { item: await stockMove(venueId, s, b) };
    case 'recipe': await saveRecipe(venueId, s, b); return { ok: true };
    case 'prep': await savePrep(venueId, s, b); return { ok: true };
    case 'produce': return { item: await produce(venueId, s, b) };
    case 'supplier': return { supplier: await saveSupplier(venueId, s, id, b) };
    case 'pay': return { payment: await paySupplier(venueId, s, b) };
    case 'purchase': return { purchase: await createPurchase(venueId, s, b) };
    case 'receive': return { purchase: await receivePurchase(venueId, s, b) };
    case 'close_purchase': await closePurchase(venueId, s, String(b.id)); return { ok: true };
    case 'count': return { count: await finishCount(venueId, s, b) };
    case 'send': return { transfer: await sendTransfer(venueId, s, b) };
    case 'arrive': await receiveTransfer(venueId, s, b); return { ok: true };
    case 'cancel_send': await cancelTransfer(venueId, s, String(b.id)); return { ok: true };
    default: throw bad('Unknown action');
  }
});
