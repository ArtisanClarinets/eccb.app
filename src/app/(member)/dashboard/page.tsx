import { redirect } from 'next/navigation';

// Redirect /dashboard to /member as part of route consolidation
// The /member route is now the canonical member area
export default function DashboardPage() {
  redirect('/member');
}
