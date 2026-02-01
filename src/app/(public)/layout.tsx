import { PublicNavigation } from '@/components/public/navigation';
import { PublicFooter } from '@/components/public/footer';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavigation />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
