import { prisma } from '@/lib/db';
import { formatDate, formatRelativeTime } from '@/lib/date';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Newspaper, ArrowRight, Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'News | Emerald Coast Community Band',
  description: 'Latest news and updates from the Emerald Coast Community Band',
};

export default async function NewsPage() {
  const now = new Date();

  // Get published pages that are marked as news/blog posts
  const newsPages = await prisma.page.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { lte: now },
      // Filter by slug pattern for news articles
      slug: { startsWith: 'news/' },
      deletedAt: null,
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  });

  // Also get recent announcements that are public
  const announcements = await prisma.announcement.findMany({
    where: {
      publishAt: { lte: now },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
      audience: 'ALL',
      status: 'PUBLISHED',
    },
    include: {
      author: {
        select: { name: true },
      },
    },
    orderBy: [
      { isPinned: 'desc' },
      { publishAt: 'desc' },
    ],
    take: 10,
  });

  return (
    <div className="w-full py-12 md:py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">News & Updates</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Stay informed with the latest news and announcements from the Emerald Coast Community Band
        </p>
      </div>

      {/* Featured Announcements */}
      {announcements.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Announcements</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {announcements.slice(0, 4).map((announcement) => (
              <Card key={announcement.id} className={announcement.isPinned ? 'border-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {announcement.isPinned && (
                      <Badge variant="default">Pinned</Badge>
                    )}
                    <Badge variant="outline">{announcement.type}</Badge>
                  </div>
                  <CardTitle>{announcement.title}</CardTitle>
                  <CardDescription>
                    {announcement.publishAt && formatRelativeTime(announcement.publishAt)}
                    {announcement.author?.name && ` • ${announcement.author.name}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3">
                    {announcement.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* News Articles */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Recent News</h2>
        {newsPages.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Newspaper className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No news articles yet</h3>
              <p className="text-muted-foreground">
                Check back soon for the latest updates from the band
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {newsPages.map((page) => (
              <Card key={page.id}>
                <CardHeader>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(page.publishedAt || page.createdAt)}
                  </div>
                  <CardTitle>
                    <Link
                      href={`/${page.slug}`}
                      className="hover:text-primary transition-colors"
                    >
                      {page.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {page.metaDescription && (
                    <p className="text-muted-foreground mb-4">{page.metaDescription}</p>
                  )}
                  <Button variant="outline" asChild>
                    <Link href={`/${page.slug}`}>
                      Read More
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
