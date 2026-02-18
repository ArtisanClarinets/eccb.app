import { prisma } from '@/lib/db';
import type { User, UserRole, Role, Member } from '@prisma/client';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Users, Award } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Our Directors | Emerald Coast Community Band',
  description: 'Meet the talented directors and leadership team of the Emerald Coast Community Band',
};

// Define the shape of user with roles and member included
type UserWithRoles = User & {
  roles: (UserRole & { role: Role })[];
  member: Member | null;
};

export default async function DirectorsPage() {
  console.log('[DirectorsPage] Starting prerender at:', new Date().toISOString());
  
  let leadershipUsers: UserWithRoles[] = [];
  try {
    console.log('[DirectorsPage] Fetching leadership users from database...');
    const startTime = Date.now();
    
    // Get users with director or board roles
    leadershipUsers = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: {
            name: { in: ['DIRECTOR', 'BOARD_MEMBER', 'ADMIN'] },
          },
        },
      },
      deletedAt: null,
    },
    include: {
      roles: {
        include: { role: true },
      },
      member: true,
    },
    orderBy: { name: 'asc' },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[DirectorsPage] Query completed in ${elapsed}ms, fetched ${leadershipUsers.length} users`);
  } catch (error) {
    console.error('[DirectorsPage] Database error:', error);
    leadershipUsers = [];
  }

  // Separate directors from board members
  const directors = leadershipUsers.filter((u) =>
    u.roles.some((r: UserRole & { role: Role }) => r.role.name === 'DIRECTOR')
  );
  const boardMembers = leadershipUsers.filter((u) =>
    u.roles.some((r: UserRole & { role: Role }) => r.role.name === 'BOARD_MEMBER')
  );

  return (
    <div className="w-full py-12 md:py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Our Leadership</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Meet the dedicated individuals who lead and inspire the Emerald Coast Community Band
        </p>
      </div>

      {/* Music Directors */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-8">
          <Music className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold">Music Directors</h2>
        </div>

        {directors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Director information coming soon</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {directors.map((director) => (
              <Card key={director.id} className="overflow-hidden">
                <div className="aspect-square relative bg-muted">
                  {director.image ? (
                    <Image
                      src={director.image}
                      alt={director.name || 'Director'}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Users className="h-24 w-24 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold mb-1">{director.name}</h3>
                  <p className="text-primary font-medium mb-3">
                    {director.roles.find((r) => r.role.name === 'DIRECTOR')?.role.displayName || 'Director'}
                  </p>
                  {director.member?.notes && (
                    <p className="text-muted-foreground text-sm line-clamp-4">
                      {director.member.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Board of Directors */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <Award className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold">Board of Directors</h2>
        </div>

        {boardMembers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Board information coming soon</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {boardMembers.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-6 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted overflow-hidden">
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.name || 'Board Member'}
                        width={80}
                        height={80}
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Users className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold">{member.name}</h3>
                  <p className="text-primary text-sm">
                    {member.roles.find((r) => r.role.name === 'BOARD_MEMBER')?.role.displayName || 'Board Member'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* About Our Leadership */}
      <section className="mt-16">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-8 md:p-12">
            <h2 className="text-2xl font-bold mb-4">About Our Leadership</h2>
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                The Emerald Coast Community Band is led by dedicated musicians and volunteers who 
                share a passion for bringing quality music to our community. Our directors bring 
                decades of combined experience in music education, performance, and community 
                engagement.
              </p>
              <p>
                Our board of directors works tirelessly to ensure the band has the resources and 
                support needed to continue our mission of musical excellence. From organizing 
                concerts to managing finances, their volunteer efforts make our performances possible.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
