'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(
        '.hero-bg',
        { scale: 1.1, filter: 'blur(10px)' },
        { scale: 1, filter: 'blur(0px)', duration: 2 }
      )
        .fromTo(
          titleRef.current,
          { y: 60, opacity: 0 },
          { y: 0, opacity: 1, duration: 1 },
          '-=1.2'
        )
        .fromTo(
          subRef.current,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 1 },
          '-=0.8'
        )
        .fromTo(
          actionsRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 1 },
          '-=0.6'
        );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20"
    >
      {/* Background Image */}
      <div className="hero-bg absolute inset-0 -z-10 bg-[#0f172a]">
        <Image
          src="/images/hero_bg.png"
          alt="Emerald Coast Sunset"
          fill
          className="object-cover opacity-60 mix-blend-overlay"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />
      </div>

      <div className="container mx-auto px-6 text-center">
        <div className="mx-auto max-w-4xl">
          <h1
            ref={titleRef}
            className="mb-8 font-display text-5xl font-black tracking-tight text-foreground md:text-7xl lg:text-8xl"
          >
            Music for the <span className="text-primary italic">Emerald Coast</span>
          </h1>
          <p
            ref={subRef}
            className="mx-auto mb-10 max-w-2xl text-lg text-foreground/80 md:text-xl lg:text-2xl"
          >
            A symphonic legacy on Florida's beautiful shoreline. Join us in our
            mission to share the gift of music with the community.
          </p>
          <div
            ref={actionsRef}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button asChild size="lg" className="h-14 bg-primary px-10 text-lg hover:bg-primary/90">
              <Link href="/about">Discover Our Story</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 border-primary px-10 text-lg text-primary hover:bg-primary/5"
            >
              <Link href="/events">Upcoming Performances</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Subtle bottom accent */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce opacity-40">
        <div className="h-1 w-20 rounded-full bg-primary" />
      </div>
    </section>
  );
}
