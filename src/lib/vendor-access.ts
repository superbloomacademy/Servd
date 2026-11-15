import { bad, forbidden } from './api';
import type { Staff } from './auth';

// Which vendor a staff request acts on. Super admin passes ?vendorId=…; everyone else uses their own.
export function vendorIdFor(s: Staff, req: Request, bodyVendorId?: unknown) {
  if (s.role === 'super_admin') {
    const v = String(bodyVendorId || new URL(req.url).searchParams.get('vendorId') || '');
    if (!/^[0-9a-f-]{36}$/.test(v)) throw bad('Choose a vendor');
    return v;
  }
  if (!s.vendorId) throw forbidden();
  return s.vendorId;
}
