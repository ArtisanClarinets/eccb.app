import { prisma } from '@/lib/db';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, ExternalLink, Building2 } from 'lucide-react';

export const metadata = {
  title: 'Our Sponsors | Emerald Coast Community Band',
  description: 'Thank you to our generous sponsors who support the Emerald Coast Community Band',
};

interface Sponsor {
  id: string;
  name: string;
  logo?: string;
  website?: string;
  description?: string;
  level: string;
}

export default async function SponsorsPage() {
  // Get sponsors from system settings or a sponsors table
  // For now, we'll use a placeholder structure
  const sponsorsSetting = await prisma.systemSetting.findUnique({
    where: { key: 'sponsors' },
  });

  let sponsors: Sponsor[] = [];
  if (sponsorsSetting?.value) {
    try {
      sponsors = JSON.parse(sponsorsSetting.value);
    } catch {
      sponsors = [];
    }
  }

  const platinumSponsors = sponsors.filter(s => s.level === 'platinum');
  const goldSponsors = sponsors.filter(s => s.level === 'gold');
  const silverSponsors = sponsors.filter(s => s.level === 'silver');
  const bronzeSponsors = sponsors.filter(s => s.level === 'bronze');

  return (
    <div className="container py-12 md:py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 text-primary mb-4">
          <Heart className="h-8 w-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">Our Sponsors</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          We are grateful for the generous support of our sponsors who help us bring quality 
          music to the Emerald Coast community.
        </p>
      </div>

      {/* Sponsor Tiers */}
      {platinumSponsors.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Platinum Sponsors</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {platinumSponsors.map((sponsor) => (
              <Card key={sponsor.id} className="border-2 border-primary">
                <CardContent className="p-8">
                  <div className="flex items-center gap-6">
                    {sponsor.logo ? (
                      <Image
                        src={sponsor.logo}
                        alt={sponsor.name}
                        width={120}
                        height={80}
                        className="object-contain"
                      />
                    ) : (
                      <div className="w-[120px] h-[80px] bg-muted rounded flex items-center justify-center">
                        <Building2 className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-xl font-bold">{sponsor.name}</h3>
                      {sponsor.description && (
                        <p className="text-muted-foreground mt-2">{sponsor.description}</p>
                      )}
                      {sponsor.website && (
                        <Button variant="link" className="p-0 mt-2" asChild>
                          <a href={sponsor.website} target="_blank" rel="noopener noreferrer">
                            Visit Website
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {goldSponsors.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Gold Sponsors</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {goldSponsors.map((sponsor) => (
              <Card key={sponsor.id}>
                <CardContent className="p-6 text-center">
                  {sponsor.logo ? (
                    <Image
                      src={sponsor.logo}
                      alt={sponsor.name}
                      width={100}
                      height={60}
                      className="object-contain mx-auto mb-4"
                    />
                  ) : (
                    <div className="w-[100px] h-[60px] bg-muted rounded mx-auto mb-4 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <h3 className="font-bold">{sponsor.name}</h3>
                  {sponsor.website && (
                    <Button variant="link" size="sm" className="p-0 mt-2" asChild>
                      <a href={sponsor.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {silverSponsors.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Silver Sponsors</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {silverSponsors.map((sponsor) => (
              <Card key={sponsor.id}>
                <CardContent className="p-4 text-center">
                  <h3 className="font-medium">{sponsor.name}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {bronzeSponsors.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Bronze Sponsors</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {bronzeSponsors.map((sponsor) => (
              <span key={sponsor.id} className="text-muted-foreground">
                {sponsor.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* No Sponsors Yet */}
      {sponsors.length === 0 && (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-bold mb-2">Sponsor Information Coming Soon</h3>
            <p className="text-muted-foreground">
              We&apos;re currently updating our sponsor information. Please check back soon!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Become a Sponsor CTA */}
      <section className="mt-16">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Become a Sponsor</h2>
            <p className="text-lg opacity-90 max-w-2xl mx-auto mb-6">
              Support the arts in our community! Your sponsorship helps us provide free concerts, 
              music education, and cultural enrichment to the Emerald Coast.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button variant="secondary" size="lg" asChild>
                <Link href="/contact">Contact Us</Link>
              </Button>
              <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10" asChild>
                <Link href="/sponsorship-info">Sponsorship Levels</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
