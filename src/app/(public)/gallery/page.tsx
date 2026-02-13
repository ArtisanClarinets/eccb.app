import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Calendar, Music, Users } from 'lucide-react';

export const metadata = {
  title: 'Photo Gallery | Emerald Coast Community Band',
  description: 'Browse photos from concerts, rehearsals, and events of the Emerald Coast Community Band',
};

// Placeholder gallery data - in production, this would come from a database or storage
const galleryCategories = [
  {
    id: 'concerts',
    label: 'Concerts',
    icon: Music,
    images: [] as { src: string; alt: string; date?: string }[],
  },
  {
    id: 'rehearsals',
    label: 'Rehearsals',
    icon: Users,
    images: [] as { src: string; alt: string; date?: string }[],
  },
  {
    id: 'events',
    label: 'Community Events',
    icon: Calendar,
    images: [] as { src: string; alt: string; date?: string }[],
  },
];

export default function GalleryPage() {
  const hasImages = galleryCategories.some(cat => cat.images.length > 0);

  return (
    <div className="w-full py-12 md:py-16">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 text-primary mb-4">
          <Camera className="h-8 w-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">Photo Gallery</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Explore photos from our concerts, rehearsals, and community events
        </p>
      </div>

      {hasImages ? (
        <Tabs defaultValue="concerts" className="space-y-8">
          <TabsList className="justify-center">
            {galleryCategories.map((category) => (
              <TabsTrigger key={category.id} value={category.id} className="gap-2">
                <category.icon className="h-4 w-4" />
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {galleryCategories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              {category.images.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <category.icon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No photos yet</h3>
                    <p className="text-muted-foreground">
                      Photos from {category.label.toLowerCase()} will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {category.images.map((image, index) => (
                    <Card key={index} className="overflow-hidden group cursor-pointer">
                      <div className="aspect-square relative">
                        <Image
                          src={image.src}
                          alt={image.alt}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                      </div>
                      {image.date && (
                        <CardContent className="p-3">
                          <p className="text-sm text-muted-foreground">{image.date}</p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="py-16 text-center">
            <Camera className="mx-auto h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-4">Gallery Coming Soon</h2>
            <p className="text-muted-foreground mb-6">
              We&apos;re working on adding photos from our recent events. 
              Check back soon to see the Emerald Coast Community Band in action!
            </p>
            <div className="grid gap-4 md:grid-cols-3 max-w-lg mx-auto text-sm text-muted-foreground">
              <div className="flex items-center gap-2 justify-center">
                <Music className="h-4 w-4" />
                Concert Photos
              </div>
              <div className="flex items-center gap-2 justify-center">
                <Users className="h-4 w-4" />
                Rehearsal Shots
              </div>
              <div className="flex items-center gap-2 justify-center">
                <Calendar className="h-4 w-4" />
                Event Highlights
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo Submission Info */}
      <section className="mt-16">
        <Card className="bg-muted/50">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Share Your Photos</h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-4">
              Have photos from one of our events? We&apos;d love to include them in our gallery!
              Please email your photos to our webmaster or share them at the next rehearsal.
            </p>
            <p className="text-sm text-muted-foreground">
              By submitting photos, you grant the Emerald Coast Community Band permission 
              to use them for promotional purposes.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
