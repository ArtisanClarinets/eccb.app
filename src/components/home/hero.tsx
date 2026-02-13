'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import heroBg from '@/assets/hero_bg.jpg';
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
      className="relative flex items-center justify-center overflow-hidden"
      // Make the hero fill the visible viewport minus the fixed header so
      // vertical centering appears correct with the fixed navigation.
      style={{ minHeight: 'calc(100vh - var(--site-header-height, 4rem))' }}
    >
      {/* Background Image */}
      <div className="hero-bg absolute inset-0 -z-10 bg-[#0f172a]">
        <Image
          src={heroBg}
          alt="Emerald Coast Sunset"
          fill
          placeholder="blur"
          sizes="100vw"
          className="object-cover opacity-75"
          priority
        />

        {/* Stronger gradient overlay for consistent contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/70" aria-hidden />

        {/* subtle vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(0,0,0,0.35)_0%,_transparent_40%)] opacity-40" aria-hidden />
      </div>

      <div className="mx-auto w-full max-w-4xl px-6 text-center">
        <div className="mx-auto max-w-3xl">
          <h1
            ref={titleRef}
            className="mb-6 font-display text-4xl font-extrabold tracking-tight text-white drop-shadow-md md:text-6xl lg:text-7xl"
          >
            Music for the <span className="text-primary italic">Emerald Coast</span>
          </h1>
          <p
            ref={subRef}
            className="mx-auto mb-8 max-w-2xl text-base text-white/85 md:text-lg lg:text-xl"
          >
            A symphonic legacy on Florida's beautiful shoreline. Join us in our
            mission to share the gift of music with the community.
          </p>
          <div
            ref={actionsRef}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button asChild size="lg" className="h-16 px-12 text-lg shadow-xl">
              <Link href="/about" aria-label="Discover our story">Discover Our Story</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-16 border-white/20 px-12 text-lg text-white hover:bg-white/5"
            >
              <Link href="/events" aria-label="View upcoming performances">Upcoming Performances</Link>
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
