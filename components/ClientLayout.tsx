'use client';

import { PageTransition } from './PageTransition';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}


