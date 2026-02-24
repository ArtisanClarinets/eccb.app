import React from 'react';
import { requireAuth } from '@/lib/auth/guards';
import { DashboardSidebar } from '@/components/dashboard/sidebar';


export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="flex h-screen bg-muted/30">
      <DashboardSidebar user={session.user} />

      <main className="flex-1 transition-all md:ml-64">
        <div className="h-full overflow-y-auto px-6 py-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
