import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Clock, MapPin, Users, ArrowRight, CheckCircle, Music, Star, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

gsap.registerPlugin(ScrollTrigger);

const rehearsalInfo = [
  {
    icon: Clock,
    label: 'When',
    value: 'Every Tuesday',
    detail: '7:00 PM - 9:00 PM',
  },
  {
    icon: MapPin,
    label: 'Where',
    value: 'Meigs Middle School',
    detail: 'Band Room • Fort Walton Beach, FL',
  },
  {
    icon: Users,
    label: 'Who',
    value: 'Open to All',
    detail: 'Any skill level welcome',
  },
];

const benefits = [
  { icon: CheckCircle, text: 'No auditions required' },
  { icon: CheckCircle, text: 'Professional conductor' },
  { icon: CheckCircle, text: 'Sheet music provided' },
  { icon: CheckCircle, text: 'Multiple performances' },
  { icon: CheckCircle, text: 'Social events & community' },
  { icon: CheckCircle, text: 'Family-friendly environment' },
];

const testimonials = [
  { name: 'Sarah M.', role: 'Flute', text: 'Best decision I ever made!' },
  { name: 'Mike R.', role: 'Trumpet', text: 'Like a second family.' },
  { name: 'Lisa K.', role: 'Clarinet', text: 'Reignited my love for music!' },
];

export default function JoinUs() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Content slide from left
      gsap.fromTo(
        contentRef.current,
        { x: -80, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          toggleActions: 'play none none reverse',
        },
      });

      // Headline animation
      tl.fromTo(
        '.join-headline',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' },
        0.2
      );

      // Info cards
      tl.fromTo(
        '.info-card',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'expo.out' },
        0.4
      );

      // Benefits
      tl.fromTo(
        '.benefit-item',
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'expo.out' },
        0.6
      );

      // CTA
      tl.fromTo(
        '.join-cta',
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' },
        0.9
      );

      // Image reveal
      gsap.fromTo(
        imageRef.current,
        { 
          clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)', 
          scale: 1.15 
        },
        {
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
          scale: 1,
          duration: 1.2,
          ease: 'expo.out',
          delay: 0.3,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Floating badge animation
      gsap.fromTo(
        '.floating-badge',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'elastic.out(1, 0.5)',
          delay: 1,
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

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="join"
      ref={sectionRef}
      className="relative py-24 sm:py-32 bg-gradient-to-br from-gray-50 to-white overflow-hidden"
    >
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-0 w-96 h-96 bg-teal-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-0 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
        
        {/* Decorative music notes */}
        <Music className="absolute top-32 right-20 w-8 h-8 text-teal-200/50 rotate-12" />
        <Music className="absolute bottom-40 left-20 w-6 h-6 text-amber-200/50 -rotate-12" />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-0 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-0 items-center">
          {/* Content - Left side */}
          <div
            ref={contentRef}
            className="lg:col-span-5 lg:pr-16 xl:pr-24 px-4 sm:px-6 lg:px-0 order-2 lg:order-1"
          >
            {/* Section label */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium mb-6">
              <Star className="w-4 h-4" />
              Become a Member
            </div>

            <h2 className="join-headline font-display text-4xl sm:text-5xl font-bold text-gray-800 mb-6">
              Join Our{' '}
              <span className="text-gradient">Musical Family</span>
            </h2>

            <p className="text-gray-600 text-lg leading-relaxed mb-8">
              Open to all musicians, regardless of experience. Whether you haven't 
              picked up your instrument in years or you play every day, you'll find 
              a welcoming home with us. Come make music and friendships that last a lifetime!
            </p>

            {/* Rehearsal Info Cards */}
            <div className="space-y-4 mb-8">
              {rehearsalInfo.map((info, index) => (
                <div
                  key={index}
                  className="info-card group flex items-center gap-4 p-5 rounded-2xl bg-white shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
                >
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-teal-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <info.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{info.label}</p>
                    <p className="font-semibold text-gray-800 text-lg">{info.value}</p>
                    <p className="text-sm text-gray-500">{info.detail}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>

            {/* Benefits */}
            <div className="mb-8">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-teal-500" />
                What Our Members Love
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="benefit-item flex items-center gap-2 group">
                    <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-200 transition-colors">
                      <CheckCircle className="w-3 h-3 text-teal-600" />
                    </div>
                    <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">{benefit.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={() => scrollToSection('#contact')}
              className="join-cta bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-semibold px-8 py-6 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-teal-500/30 group text-lg"
            >
              Become A Member
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          {/* Image - Right side, bleeds right edge */}
          <div className="lg:col-span-7 relative order-1 lg:order-2">
            <div
              ref={imageRef}
              className="relative aspect-[4/5] overflow-hidden rounded-l-3xl lg:rounded-l-none shadow-3d"
            >
              <img
                src="/join-duo.jpg"
                alt="Musicians playing together"
                className="w-full h-full object-cover"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-gray-50/20" />
              
              {/* Vignette */}
              <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.2)]" />
            </div>

            {/* Decorative element */}
            <div className="absolute -left-4 top-1/2 w-8 h-32 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full blur-xl opacity-50" />

            {/* Floating badge */}
            <div className="floating-badge absolute bottom-8 left-8 bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-lg">50+</p>
                  <p className="text-xs text-gray-500">Active Members</p>
                </div>
              </div>
            </div>

            {/* Testimonial bubbles */}
            <div className="absolute top-8 left-8 bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow-lg max-w-[200px]">
              <div className="flex items-start gap-2">
                <Star className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-700 font-medium">
                    {testimonials[activeTestimonial].text}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    — {testimonials[activeTestimonial].name}, {testimonials[activeTestimonial].role}
                  </p>
                </div>
              </div>
            </div>

            {/* Testimonial indicators */}
            <div className="absolute top-24 left-8 flex gap-1.5">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTestimonial(index)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    index === activeTestimonial ? 'bg-amber-400 w-4' : 'bg-amber-300/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
