import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Calendar, ArrowRight, MapPin, Clock, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';

gsap.registerPlugin(ScrollTrigger);

const events = [
  {
    id: 1,
    title: 'Spring Concert',
    date: 'April 15, 2024',
    time: '7:00 PM',
    location: 'Fort Walton Beach Auditorium',
    image: '/event-spring.jpg',
    description: 'Our annual spring showcase featuring classical and contemporary pieces.',
    color: 'from-green-400 to-emerald-500',
  },
  {
    id: 2,
    title: 'Summer Festival',
    date: 'July 8, 2024',
    time: '6:00 PM',
    location: 'Emerald Coast Convention Center',
    image: '/event-summer.jpg',
    description: 'Outdoor summer music festival with special guest performers.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    id: 3,
    title: 'Holiday Gala',
    date: 'December 12, 2024',
    time: '7:30 PM',
    location: 'Mattie Kelly Arts Center',
    image: '/event-holiday.jpg',
    description: 'Annual holiday concert featuring festive classics and new arrangements.',
    color: 'from-red-400 to-rose-500',
  },
];

export default function Events() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Section headline
      gsap.fromTo(
        '.events-headline',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Description
      gsap.fromTo(
        '.events-description',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'power2.out',
          delay: 0.2,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Event cards with stagger and rise
      gsap.fromTo(
        '.event-card',
        { y: 80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.15,
          ease: 'expo.out',
          delay: 0.3,
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, cardId: number) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setMousePosition({ x, y });
    setHoveredCard(cardId);
  };

  const getCardStyle = (cardId: number) => {
    const isHovered = hoveredCard === cardId;
    const isOtherHovered = hoveredCard !== null && hoveredCard !== cardId;
    
    if (!isHovered) {
      return {
        transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(${isOtherHovered ? 0.95 : 1})`,
        opacity: isOtherHovered ? 0.7 : 1,
      };
    }

    const rotateX = (mousePosition.y - 0.5) * -15;
    const rotateY = (mousePosition.x - 0.5) * 15;

    return {
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.03)`,
      opacity: 1,
    };
  };

  return (
    <section
      id="events"
      ref={sectionRef}
      className="relative py-24 sm:py-32 bg-gradient-to-b from-white to-gray-50 overflow-hidden"
    >
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-40 right-0 w-96 h-96 bg-purple-100/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-0 w-80 h-80 bg-blue-100/20 rounded-full blur-3xl" />
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-20 w-2 h-2 bg-teal-400 rounded-full opacity-50" />
        <div className="absolute top-40 right-40 w-3 h-3 bg-amber-400 rounded-full opacity-40" />
        <div className="absolute bottom-40 left-40 w-2 h-2 bg-purple-400 rounded-full opacity-40" />
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 text-purple-700 text-sm font-medium mb-6">
            <Calendar className="w-4 h-4" />
            Upcoming Performances
          </div>
          
          <h2 className="events-headline font-display text-4xl sm:text-5xl font-bold text-gray-800 mb-4">
            Upcoming{' '}
            <span className="text-gradient">Events</span>
          </h2>
          <p className="events-description text-gray-600 text-lg">
            Experience our music live at performances throughout the year. 
            Join us for unforgettable evenings of community and melody.
          </p>
        </div>

        {/* Event Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {events.map((event, index) => (
            <div
              key={event.id}
              className={`event-card card-3d relative rounded-3xl overflow-hidden bg-white transition-all duration-500 ${
                hoveredCard === event.id ? 'z-20 shadow-3d-hover' : 'z-10 shadow-3d'
              }`}
              style={{
                ...getCardStyle(event.id),
                transform: `${getCardStyle(event.id).transform} translateY(${index === 1 ? -20 : 0}px)`,
              }}
              onMouseMove={(e) => handleMouseMove(e, event.id)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              {/* Image container */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-full object-cover transition-transform duration-700"
                  style={{
                    transform: hoveredCard === event.id ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
                
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Date badge with gradient */}
                <div className={`absolute top-4 left-4 px-4 py-2 rounded-xl bg-gradient-to-br ${event.color} shadow-lg`}>
                  <p className="text-white text-xs font-medium opacity-90">{event.date.split(', ')[0]}</p>
                  <p className="text-white font-display font-bold text-xl">{event.date.split(', ')[1]}</p>
                </div>

                {/* Shimmer effect on hover */}
                {hoveredCard === event.id && (
                  <div className="absolute inset-0 shimmer opacity-20 rounded-t-3xl" />
                )}
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Title with icon */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center`}>
                    <Ticket className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-gray-800">
                    {event.title}
                  </h3>
                </div>
                
                {/* Meta info */}
                <div className="flex flex-wrap gap-4 mb-3 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{event.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate">{event.location}</span>
                  </div>
                </div>

                <p className="text-gray-600 text-sm mb-5 line-clamp-2">
                  {event.description}
                </p>

                <Button
                  variant="outline"
                  className="w-full border-2 font-semibold transition-all duration-300 group"
                  style={{
                    background: hoveredCard === event.id 
                      ? `linear-gradient(135deg, ${event.color.includes('green') ? '#10b981' : event.color.includes('amber') ? '#f59e0b' : '#ef4444'}, ${event.color.includes('green') ? '#059669' : event.color.includes('amber') ? '#d97706' : '#dc2626'})` 
                      : 'transparent',
                    color: hoveredCard === event.id ? 'white' : undefined,
                    borderColor: hoveredCard === event.id ? 'transparent' : undefined,
                  }}
                >
                  Get Tickets
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* View All Events CTA */}
        <div className="text-center mt-16">
          <Button
            variant="outline"
            className="border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 px-8 py-6 text-lg font-semibold transition-all duration-300 hover:shadow-lg group"
          >
            View All Events
            <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}
