'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Music, 
  Calendar, 
  Users, 
  Settings, 
  LogOut, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Logo } from '@/components/icons/logo';
import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';

// Updated to point to /member routes (canonical member area)
const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/member' },
  { icon: Music, label: 'My Music', href: '/member/music' },
  { icon: Calendar, label: 'Calendar', href: '/member/calendar' },
  { icon: Users, label: 'Attendance', href: '/member/attendance' },
  { icon: Settings, label: 'Settings', href: '/member/settings' },
];

export function DashboardSidebar({ user }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card shadow-sm transition-transform -translate-x-full md:translate-x-0">
      <div className="flex h-full flex-col px-4 py-6">
        {/* Brand */}
        <Link href="/" className="mb-10 flex items-center gap-3 px-2" aria-label="Emerald Coast Community Band">
          <Logo className="h-9 w-auto text-primary" />
          <span className="sr-only">Emerald Coast Community Band</span>
        </Link>

        {/* User Profile Summary */}
        <div className="mb-10 px-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-bold text-foreground">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground uppercase tracking-tighter">
                {user?.role || 'Member'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-grow space-y-1">
          {menuItems.map((item) => {
            // Handle active state for /member base path
            const isActive = item.href === '/member' 
              ? pathname === '/member' 
              : pathname.startsWith(item.href);
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} />
                  {item.label}
                </div>
                {isActive && <ChevronRight size={16} />}
              </Link>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="space-y-1 pt-6 border-t mt-auto">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl"
          >
            <ExternalLink size={20} />
            Public Website
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
