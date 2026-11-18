import { bad, body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { requireFeature } from '@/lib/vendor-access';
import { inventoryOverview, saveRecipe, saveStockItem, stockMove } from '@/lib/inventory';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.inventory);
  await requireFeature(venueId, 'inventory');
  return inventoryOverview(venueId);
});

// { action: 'item', id?, ...fields } | { action: 'move', stockItemId, kind, qty, costPaise, supplier, note } | { action: 'recipe', itemId, variantId, lines }
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.inventory);
  await requireFeature(venueId, 'inventory');
  const b = await body<{ action: string; id?: string }>(req);
  if (b.action === 'item') return { item: await saveStockItem(venueId, s, b.id && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null, b) };
  if (b.action === 'move') return { item: await stockMove(venueId, s, b) };
  if (b.action === 'recipe') { await saveRecipe(venueId, s, b); return { ok: true }; }
  throw bad('Unknown action');
});
