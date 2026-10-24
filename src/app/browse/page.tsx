'use client';

import { Suspense } from 'react';
import { Header } from '@/components/header';
import { SourceBrowser } from '@/components/source-browser';
import { SiteFooter } from '@/components/site-footer';
import { LoadingState } from '@/components/states';

export default function BrowsePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Suspense fallback={<LoadingState label="正在打开片库..." />}><SourceBrowser /></Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
