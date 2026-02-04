import { prisma } from '@/lib/db';

export default async function HomePage() {
  const announcements = await prisma.announcement.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 3,
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="bg-primary text-white p-12 rounded-lg text-center">
        <h1 className="text-4xl font-display mb-4">Emerald Coast Community Band</h1>
        <p className="text-xl">Making music together on the Emerald Coast</p>
      </section>

      <section className="p-4">
        <h2 className="text-2xl font-bold mb-4">Latest News</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="border p-4 rounded shadow-sm">
              <h3 className="font-bold">{announcement.title}</h3>
              <p className="line-clamp-3 mt-2">{announcement.content}</p>
            </div>
          ))}
          {announcements.length === 0 && (
            <p className="text-gray-500">No recent announcements.</p>
          )}
        </div>
      </section>
    </div>
  );
}
