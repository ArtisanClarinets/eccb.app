import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Quote as QuoteIcon, Sparkles } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function Quote() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const quoteTextRef = useRef<HTMLParagraphElement>(null);
  const attributionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Opening quote mark with scale and rotation
      gsap.fromTo(
        '.quote-open',
        { scale: 0, rotate: -45, opacity: 0 },
        {
          scale: 1,
          rotate: 0,
          opacity: 0.15,
          duration: 0.8,
          ease: 'elastic.out(1, 0.5)',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Quote text word-by-word reveal with blur
      const words = quoteTextRef.current?.querySelectorAll('.word');
      if (words) {
        gsap.fromTo(
          words,
          { opacity: 0, filter: 'blur(8px)', y: 20 },
          {
            opacity: 1,
            filter: 'blur(0px)',
            y: 0,
            duration: 0.5,
            stagger: 0.05,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top 60%',
              toggleActions: 'play none none reverse',
            },
          }
        );
      }

      // Closing quote mark
      gsap.fromTo(
        '.quote-close',
        { scale: 0, rotate: 45, opacity: 0 },
        {
          scale: 1,
          rotate: 0,
          opacity: 0.15,
          duration: 0.8,
          ease: 'elastic.out(1, 0.5)',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 50%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Attribution with slide up
      gsap.fromTo(
        attributionRef.current,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 40%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Decorative sparkles
      gsap.fromTo(
        '.sparkle',
        { scale: 0, rotate: -90, opacity: 0 },
        {
          scale: 1,
          rotate: 0,
          opacity: 0.6,
          duration: 0.6,
          stagger: 0.15,
          ease: 'elastic.out(1, 0.5)',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 50%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  const quoteText = "Music is the universal language of mankind, and community is where that language finds its voice.";
  const words = quoteText.split(' ');

  return (
    <section
      ref={sectionRef}
      className="relative py-28 sm:py-36 bg-gradient-to-b from-gray-50 to-white overflow-hidden"
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-2 h-2 bg-teal-400 rounded-full sparkle opacity-0" />
        <div className="absolute top-40 right-20 w-3 h-3 bg-amber-400 rounded-full sparkle opacity-0" />
        <div className="absolute bottom-32 left-1/4 w-2 h-2 bg-teal-300 rounded-full sparkle opacity-0" />
        <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-amber-300 rounded-full sparkle opacity-0" />
        
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-amber-100/20 rounded-full blur-3xl" />
      </div>

      {/* Large quote marks */}
      <QuoteIcon className="quote-open absolute top-16 left-8 sm:left-20 w-32 h-32 sm:w-48 sm:h-48 text-teal-600/10" />
      <QuoteIcon className="quote-close absolute bottom-16 right-8 sm:right-20 w-32 h-32 sm:w-48 sm:h-48 text-teal-600/10 rotate-180" />

      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20 relative z-10">
        <div
          ref={quoteTextRef}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Quote icon decoration */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 mb-8">
            <Sparkles className="w-8 h-8 text-teal-600" />
          </div>

          {/* Quote text with word-by-word animation */}
          <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-gray-800 leading-relaxed mb-10">
            {words.map((word, index) => (
              <span 
                key={index} 
                className={`word inline-block mr-3 ${
                  word === 'community' || word === 'voice.' 
                    ? 'text-teal-600 font-semibold' 
                    : ''
                }`}
              >
                {word}
              </span>
            ))}
          </p>

          {/* Divider */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-teal-400 to-transparent" />
            <div className="w-2 h-2 rounded-full bg-teal-400" />
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-teal-400 to-transparent" />
          </div>

          {/* Attribution */}
          <div ref={attributionRef} className="flex flex-col items-center">
            <div className="relative mb-4">
              {/* Avatar with ring */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
                <span className="text-white font-display font-bold text-xl">SM</span>
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-teal-300/50 animate-pulse" />
            </div>
            <p className="font-semibold text-gray-800 text-lg">Sarah Martinez</p>
            <p className="text-gray-500 text-sm">Flute Section Leader • 5 Years</p>
          </div>
        </div>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-200/50 to-transparent" />
    </section>
  );
}
