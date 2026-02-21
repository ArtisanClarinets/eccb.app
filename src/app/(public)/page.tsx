import React from 'react';
import { Hero } from '@/components/home/hero';
import { UpcomingEvents } from '@/components/home/upcoming-events';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Music, Users, Heart } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      
      <main className="flex-grow">
        {/* Cinematic Hero */}
        <Hero />

        {/* Core Values Section */}
        <section className="bg-background py-12 md:py-24">
          <div className="mx-auto w-full max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="font-display text-4xl font-black text-foreground uppercase tracking-tight md:text-5xl">
                More Than Just <span className="text-primary italic">Music</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                We are a non-profit organization dedicated to bringing quality wind band music 
                to Florida's Emerald Coast while providing a rewarding outlet for local musicians.
              </p>
            </div>

            <div className="grid gap-12 md:grid-cols-3">
              <div className="group text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/5 text-primary transition-all group-hover:bg-primary group-hover:text-white shadow-sm">
                  <Music size={32} />
                </div>
                <h3 className="mb-3 font-display text-2xl font-bold uppercase">Artistic Excellence</h3>
                <p className="text-sm text-muted-foreground">
                  Striving for high-quality performances through rigorous rehearsal and a diverse repertoire.
                </p>
              </div>

              <div className="group text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/5 text-accent transition-all group-hover:bg-accent group-hover:text-white shadow-sm">
                  <Users size={32} />
                </div>
                <h3 className="mb-3 font-display text-2xl font-bold uppercase">Community Connection</h3>
                <p className="text-sm text-muted-foreground">
                  Building strong bonds through music, education, and collaboration across the Emerald Coast.
                </p>
              </div>

              <div className="group text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/5 text-green-600 transition-all group-hover:bg-green-600 group-hover:text-white shadow-sm">
                  <Heart size={32} />
                </div>
                <h3 className="mb-3 font-display text-2xl font-bold uppercase">Musical Growth</h3>
                <p className="text-sm text-muted-foreground">
                  Providing an inclusive environment for musicians of all ages and backgrounds to hone their craft.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic Events Section */}
        <UpcomingEvents />

        {/* Membership CTA */}
        <section className="relative overflow-hidden bg-slate-900 py-24 text-white">
          <div className="absolute inset-0 opacity-20">
            <div className="h-full w-full bg-[radial-gradient(#0f766e_1px,transparent_1px)] [background-size:20px_20px]" />
          </div>
          
          <div className="mx-auto w-full max-w-7xl px-6 relative text-center">
            <h2 className="font-display text-4xl font-black uppercase tracking-tight md:text-6xl">
              Ready to <span className="text-primary italic">Join Us?</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
              We are always looking for passionate musicians to join our sections. 
              Whether you are a seasoned pro or returning to your instrument, there's a place for you.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="h-14 bg-primary px-8 text-lg font-bold hover:bg-primary/90">
                <Link href="/signup">Apply as Musician</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-14 border-white/20 bg-white/5 px-8 text-lg font-bold backdrop-blur-sm hover:bg-white/10">
                <Link href="/contact">Support the Band</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
