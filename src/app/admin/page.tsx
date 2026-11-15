import type { Metadata } from 'next';
import { SuperAdmin } from '@/components/admin/super-admin';

export const metadata: Metadata = { title: 'Super admin' };
export default function Page() { return <div className="min-h-dvh bg-soft"><SuperAdmin /></div>; }
