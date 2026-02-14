import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="text-center px-4">
        <div className="mb-8">
          <span className="text-9xl font-bold text-primary/20">404</span>
        </div>
        <h1 className="text-4xl font-bold text-neutral-dark mb-4">
          Page Not Found
        </h1>
        <p className="text-lg text-neutral-dark/70 mb-8 max-w-md mx-auto">
          Sorry, we couldn't find the page you're looking for. 
          It may have been moved or doesn't exist.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/">
              Return Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contact">
              Contact Support
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
