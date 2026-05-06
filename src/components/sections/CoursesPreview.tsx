import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import PrimaryButton from "../PrimaryButton";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

interface Course {
  id: string;
  image: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  extra?: string;
}

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const CoursesPreview = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        // Fetch all courses, then prioritize featured ones
        const snap = await getDocs(collection(db, "courses"));
        const allCourses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const featured = allCourses.filter((c: any) => c.featured === true);
        // Show featured courses if any, otherwise fall back to first 3
        setCourses((featured.length > 0 ? featured : allCourses).slice(0, 3));
      } catch (err) {
        console.error("Error fetching courses preview:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  return (
    <section className="py-16 sm:py-20 md:py-32" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef}>
          <div className={`${headerVisible ? "animate-scale-in" : "opacity-0"}`}>
            <SectionLabel text="WHAT WE TEACH" className="mb-6" />
          </div>
          <div className={`${headerVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: headerVisible ? "0.1s" : undefined }}>
            <h2 className="font-display font-bold text-[1.8rem] sm:text-[2rem] md:text-[3.2rem] text-foreground text-center mb-3">
              Explore Our Sacred Arts
            </h2>
          </div>
          <div className={`${headerVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: headerVisible ? "0.2s" : undefined }}>
            <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-muted-foreground text-center mb-10 sm:mb-12 max-w-lg mx-auto">
              From classical dance forms to spiritual music — find your calling.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-12">
            {/* Loading state - show nothing to avoid confusion */}
          </div>
        ) : courses.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-12">
            {courses.map((c, i) => (
              <div
                key={c.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
              <div className="bg-card shadow-card rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-hero group">
                <div className="aspect-[3/2] relative overflow-hidden">
                  {<div className="absolute inset-0 skeleton-shimmer peer" />}
                  <img src={c.image} alt={c.title} loading="lazy" onLoad={(e) => { (e.target as HTMLElement).previousElementSibling?.remove(); }} className="w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.06]" />
                </div>
                <div className="p-5 sm:p-6">
                  <span className={`inline-block px-3 py-1 text-xs font-body font-medium rounded-full mb-3 ${badgeStyles[c.badgeColor] || badgeStyles.red}`}>{c.badge}</span>
                  {c.extra && <p className="font-body text-xs text-muted-foreground mb-2">{c.extra}</p>}
                  <h3 className="font-display font-semibold text-[1.2rem] sm:text-[1.4rem] text-foreground mb-2 transition-colors duration-300 group-hover:text-gold">{c.title}</h3>
                  <p className="font-body text-[0.85rem] sm:text-[0.9rem] text-muted-foreground mb-4 leading-relaxed">{c.description}</p>
                  <Link to="/contact"><PrimaryButton compact className="text-[0.85rem]">Know More + Enquire</PrimaryButton></Link>
                </div>
              </div>
            </div>
            ))}
          </div>
        ) : (
          <div className="mb-10 sm:mb-12">
            {/* No courses available - show nothing */}
          </div>
        )}

        <div className="text-center animate-fade-up" style={{ animationDelay: "0.5s" }}>
          <Link to="/courses"><PrimaryButton>View All Courses →</PrimaryButton></Link>
        </div>
      </div>
    </section>
  );
};

export default CoursesPreview;
