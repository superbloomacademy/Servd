import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Account } from '@/components/customer/account';

export const metadata: Metadata = { title: 'My account' };

export default function Page() {
  return <Suspense><Account /></Suspense>;
}
