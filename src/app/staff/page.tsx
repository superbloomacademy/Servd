import type { Metadata } from 'next';
import { StaffShell } from '@/components/staff/shell';

export const metadata: Metadata = { title: 'Staff' };
export default function Page() { return <StaffShell />; }
