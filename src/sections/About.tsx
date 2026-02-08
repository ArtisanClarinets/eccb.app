import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Users, Music, Heart, Award, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

gsap.registerPlugin(ScrollTrigger);

const features = [
  { icon: Users, label: 'Open to All', desc: 'Musicians of any skill level welcome', color: 'from-blue-500 to-cyan-500' },
  { icon: Music, label: 'Diverse Repertoire', desc: 'From classical to contemporary hits', color: 'from-purple-500 to-pink-500' },
  { icon: Heart, label: 'Community First', desc: 'Building connections through music', color: 'from-red-500 to-rose-500' },
];

const stats = [
  { value: '50+', label: 'Active Members', icon: Users },
  { value: '10+', label: 'Years Together', icon: Calendar },
  { value: '25+', label: 'Performances', icon: Award },
];

export default function About() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Image reveal with parallax
      gsap.fromTo(
        imageRef.current,
        { 
          clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)', 
          scale: 1.15 
        },
        {
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
          scale: 1,
          duration: 1.2,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Parallax on scroll
      const imgElement = imageRef.current?.querySelector('img');
      if (imgElement) {
        gsap.to(imgElement, {
          y: -60,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }

      // Content animations
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          toggleActions: 'play none none reverse',
        },
      });

      tl.fromTo(
        '.about-headline',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }
      );

      tl.fromTo(
        '.about-description',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' },
        0.2
      );

      tl.fromTo(
        '.feature-card',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'expo.out' },
        0.3
      );

      tl.fromTo(
        '.about-cta',
        { x: 30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'expo.out' },
        0.5
      );

      // Stats counter animation
      tl.fromTo(
        '.stat-item',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'expo.out' },
        0.6
      );
    });

    return () => ctx.revert();
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative py-24 sm:py-32 bg-white overflow-hidden"
    >
      {/* Background decorations */}
      <div className="absolute top-20 right-0 w-72 h-72 bg-teal-50/50 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-0 w-96 h-96 bg-amber-50/30 rounded-full blur-3xl" />

      <div className="w-full px-4 sm:px-6 lg:px-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-0 items-center">
          {/* Image - bleeds left edge */}
          <div className="lg:col-span-6 relative">
            <div
              ref={imageRef}
              className="relative aspect-[4/5] overflow-hidden rounded-r-3xl lg:rounded-r-none shadow-3d"
            >
              <img
                src="/about-group.jpg"
                alt="Band members together"
                className="w-full h-full object-cover"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/30" />
              
              {/* Floating badge */}
              <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">Est. 2014</p>
                    <p className="text-xs text-gray-500">Making Music Together</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative element */}
            <div className="absolute -right-4 top-1/2 w-8 h-32 bg-gradient-to-b from-teal-400 to-teal-600 rounded-full blur-xl opacity-50" />
          </div>

          {/* Content */}
          <div
            ref={contentRef}
            className="lg:col-span-6 lg:pl-16 xl:pl-24 px-4 sm:px-6 lg:px-0"
          >
            {/* Section label */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium mb-6">
              <Music className="w-4 h-4" />
              About Us
            </div>

            <h2 className="about-headline font-display text-4xl sm:text-5xl font-bold text-gray-800 mb-6">
              About Our{' '}
              <span className="text-gradient">Band</span>
            </h2>

            <p className="about-description text-gray-600 text-lg leading-relaxed mb-8">
              We're a diverse group of music enthusiasts from all walks of life. 
              From classical to contemporary, we play it all with heart and harmony. 
              Our mission is to create beautiful music while building lasting friendships 
              in our community on the beautiful Emerald Coast of Florida.
            </p>

            {/* Features */}
            <div className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="feature-card group flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gradient-to-r hover:from-teal-50 hover:to-transparent transition-all duration-500 cursor-pointer"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 group-hover:text-teal-700 transition-colors">{feature.label}</h3>
                    <p className="text-sm text-gray-500">{feature.desc}</p>
                  </div>
                  <ArrowRight className="ml-auto w-5 h-5 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition-all duration-300" />
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {stats.map((stat, index) => (
                <div 
                  key={index} 
                  className="stat-item text-center p-4 rounded-xl bg-gradient-to-b from-gray-50 to-gray-100/50"
                >
                  <stat.icon className="w-5 h-5 text-teal-500 mx-auto mb-2" />
                  <p className="text-2xl font-display font-bold text-gray-800">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>

            <Button
              onClick={() => scrollToSection('#events')}
              className="about-cta bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-teal-500/30 group"
            >
              Discover Our Story
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
