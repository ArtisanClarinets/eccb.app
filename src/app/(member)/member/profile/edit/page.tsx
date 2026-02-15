import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { ProfileEditForm } from '@/components/member/profile-edit-form';

export default async function ProfileEditPage() {
  const session = await requireAuth();

  const member = await prisma.member.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      instruments: {
        include: { instrument: true },
      },
      sections: {
        include: { section: true },
      },
    },
  });

  // Get all instruments and sections for selection
  const [instruments, sections] = await Promise.all([
    prisma.instrument.findMany({
      orderBy: [{ family: 'asc' }, { name: 'asc' }],
    }),
    prisma.section.findMany({
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  if (!member) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Profile Not Found</h2>
        <p className="text-muted-foreground">
          Your member profile hasn't been set up yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
        <p className="text-muted-foreground">
          Update your personal information and preferences
        </p>
      </div>

      <ProfileEditForm
        member={member}
        instruments={instruments}
        sections={sections}
      />
    </div>
  );
}
