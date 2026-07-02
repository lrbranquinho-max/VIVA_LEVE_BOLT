"use client";

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AppDownloadPrompt from './AppDownloadPrompt';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return (
      <div className="min-h-screen w-full overflow-y-auto bg-gray-100">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto h-[100dvh] min-h-screen w-full overflow-y-auto bg-white shadow-none md:max-w-6xl md:shadow-2xl">
      {children}
      <AppDownloadPrompt />
    </div>
  );
}
