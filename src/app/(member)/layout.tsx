import { requireAuth, getUserWithProfile } from '@/lib/auth/guards';
import { MemberSidebar } from '@/components/member/sidebar';
import { MemberHeader } from '@/components/member/header';
import { isFeatureEnabled, FEATURES } from '@/lib/feature-flags';

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const user = await getUserWithProfile();

  const enabledFeatures = {
    musicStand: isFeatureEnabled(FEATURES.MUSIC_STAND),
  };

  return (
    <div className="flex min-h-screen">
      <MemberSidebar user={user} enabledFeatures={enabledFeatures} />
      <div className="flex-1 flex flex-col lg:pl-64">
        <MemberHeader user={user} />
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
