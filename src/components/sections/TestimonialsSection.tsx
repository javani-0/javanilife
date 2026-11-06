import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import TestimonialCard from "../TestimonialCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

// Sample quotes the old code auto-seeded into Firestore. They are not real reviews, so they are
// never shown (real-content rule); only testimonials the academy adds in admin appear.
const SAMPLE_QUOTES = [
  "Joining Javani was a life-changing decision. The teaching methodology is world-class, and I earned my certification within the promised timeline. The academy feels like home.",
  "My daughter has been with Javani for 3 years. Her transformation — in confidence, posture, and artistry — is nothing short of miraculous. The faculty truly cares.",
  "The grading system is transparent and well-structured. I always knew exactly where I stood and what the next milestone was. Highly recommend to any serious student.",
  "I came in as a complete beginner with no dance background. The beginner batches are incredibly welcoming, and the faculty makes learning feel joyful and sacred.",
];

interface Testimonial {
  id?: string;
  quote: string;
  name: string;
  course: string;
  stars: number;
  order?: number;
}

const TestimonialsSection = () => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [current, setCurrent] = useState(0);
  const { ref, isVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollAnimation();

  useEffect(() => {
    const fetchTestimonials = async () => {
      try {
        const snap = await getDocs(query(collection(db, "testimonials"), orderBy("order", "asc")));
        const sample = new Set(SAMPLE_QUOTES);
        setTestimonials(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Testimonial))
            .filter((t) => t.quote && !sample.has(t.quote)),
        );
      } catch (err) {
        console.error("Error fetching testimonials:", err);
      }
    };
    fetchTestimonials();
  }, []);

  const maxIndex = testimonials.length - 1;
  const next = useCallback(() => setCurrent((c) => (c >= maxIndex ? 0 : c + 1)), [maxIndex]);
  const prev = () => setCurrent((c) => (c <= 0 ? maxIndex : c - 1));

  useEffect(() => {
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [next]);

  if (testimonials.length === 0) return null;

  return (
    <section className="py-20 md:py-32 bg-ivory">
      <div className="max-w-7xl mx-auto px-6">
        <div ref={ref}>
          <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`}>
            <SectionLabel text="STUDENT LOVE" className="mb-6" />
          </div>
          <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.1s" : undefined }}>
            <h2 className="font-display font-semibold text-[2rem] md:text-[3rem] text-foreground text-center mb-12">
              Words From Our Students
            </h2>
          </div>
        </div>

        {/* Desktop: show 3 */}
        <div ref={cardsRef} className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {testimonials.slice(0, 3).map((t, i) => (
            <div key={i} className={`${cardsVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: cardsVisible ? `${i * 0.15}s` : undefined }}>
              <TestimonialCard {...t} />
            </div>
          ))}
        </div>

        {/* Mobile: carousel */}
        <div className="md:hidden">
          {testimonials[current] && <TestimonialCard {...testimonials[current]} />}
        </div>

        <div className="md:hidden flex flex-wrap items-center justify-center gap-4 mt-8">
          <button onClick={prev} className="w-10 h-10 shrink-0 rounded-full border border-gold text-gold flex items-center justify-center hover:bg-gold hover:text-white transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex min-w-0 max-w-full flex-wrap justify-center gap-2">
            {testimonials.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${i === current ? "bg-gold" : "bg-gold/30"}`} />
            ))}
          </div>
          <button onClick={next} className="w-10 h-10 shrink-0 rounded-full border border-gold text-gold flex items-center justify-center hover:bg-gold hover:text-white transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
