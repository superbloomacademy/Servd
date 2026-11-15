import type { Metadata } from 'next';
import { MenuApp } from '@/components/customer/menu-app';

export const metadata: Metadata = { title: 'Menu' };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <MenuApp code={code} />;
}
