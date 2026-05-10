import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import PrimaryButton from "../PrimaryButton";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useCourseCategories } from "@/hooks/useManagedCategories";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import {
  createCartItemFromCourse,
  getCourseDisplayPrice,
  isCoursePurchasable,
  normalizeCourse,
  type Course,
} from "@/lib/ecommerce";
import { ShoppingBag } from "lucide-react";

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const CoursesPreview = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories: courseCategories } = useCourseCategories();
  const { addItem, setBuyNowItem } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();

  const buyCourse = async (course: Course) => {
    if (!isCoursePurchasable(course)) return;
    const cartItem = createCartItemFromCourse(course);
    setBuyNowItem(cartItem);
    await addItem(cartItem);
    toast({ title: "Course ready for checkout", description: course.title });
    navigate("/checkout");
  };

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        // Fetch all courses, then prioritize featured ones
        const snap = await getDocs(collection(db, "courses"));
        const allCourses = snap.docs.map((d) => normalizeCourse(d.id, d.data(), courseCategories));
        const featured = allCourses.filter((c) => c.featured === true);
        // Show featured courses if any, otherwise fall back to first 3
        setCourses((featured.length > 0 ? featured : allCourses).slice(0, 3));
      } catch (err) {
        console.error("Error fetching courses preview:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [courseCategories]);

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
                  <p className="mb-4 font-display text-[1.1rem] font-bold text-primary">{getCourseDisplayPrice(c)}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => buyCourse(c)} disabled={!isCoursePurchasable(c)} className="inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-primary px-4 py-2 font-body text-[0.85rem] font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100">
                      <ShoppingBag className="h-4 w-4" /> {isCoursePurchasable(c) ? "Buy Now" : "Fee Soon"}
                    </button>
                    <Link to={`/courses/${c.id}`}><PrimaryButton compact className="text-[0.85rem] w-full">Details</PrimaryButton></Link>
                  </div>
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
