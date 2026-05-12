import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";
import { useCourseCategories } from "@/hooks/useManagedCategories";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import PrimaryButton from "@/components/PrimaryButton";
import { MessageCircle, ArrowLeft, Award, ShoppingBag } from "lucide-react";
import {
  createCartItemFromCourse,
  getCourseCategory,
  getCourseDisplayPrice,
  isCoursePurchasable,
  normalizeCourse,
  type Course,
} from "@/lib/ecommerce";

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const CourseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { whatsappNumber } = useContactInfo();
  const { categories: courseCategories } = useCourseCategories();
  const { addItem, setBuyNowItem } = useCart();
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "courses", id))
      .then((snap) => {
        if (snap.exists()) setCourse(normalizeCourse(snap.id, snap.data(), courseCategories));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [courseCategories, id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4">
        <h1 className="font-display text-2xl text-foreground">Course not found</h1>
        <Link to="/courses" className="text-gold hover:underline font-body text-sm">← Back to Courses</Link>
      </div>
    );
  }

  const whatsappMsg = encodeURIComponent(
    `Hi, I'm interested in the *${course.title}* course (${course.badge}) at Javani Spiritual Hub.\n\n` +
    `${course.description}${course.extra ? `\n${course.extra}` : ""}\n\n` +
    `Course link: ${window.location.href}\n\n` +
    `Please share more details.`
  );

  const meta = getCourseCategory(courseCategories, course.category);
  const purchasable = isCoursePurchasable(course);
  const buyCourse = async () => {
    if (!purchasable) return;
    const cartItem = createCartItemFromCourse(course);
    setBuyNowItem(cartItem);
    await addItem(cartItem);
    toast({ title: "Course ready for checkout", description: course.title });
    navigate("/checkout");
  };

  return (
    <>
      <SEO
        title={`${course.title} | Javani Spiritual Hub`}
        description={course.description}
        ogImage={course.image}
      />
      <main className="min-h-screen bg-background pt-[80px]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

          {/* Back */}
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold font-body text-[0.85rem] mb-8 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Courses
          </Link>

          <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-start">

            {/* Image */}
            <div className="relative rounded-2xl overflow-hidden aspect-[3/2] bg-muted">
              {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
              <img
                src={course.image}
                alt={course.title}
                onLoad={() => setImgLoaded(true)}
                className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              />
              {course.status === "inactive" && (
                <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 text-xs font-body font-semibold rounded-full shadow-lg">
                  Not Available
                </div>
              )}
              <span className={`absolute top-3 left-3 px-3 py-1 text-xs font-body font-medium rounded-full ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>
                {course.badge}
              </span>
            </div>

            {/* Info */}
            <div className="flex flex-col gap-5">

              {/* Title + Share */}
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-display font-semibold text-2xl sm:text-3xl text-foreground leading-tight">
                  {course.title}
                </h1>
                <ShareButton
                  title={course.title}
                  text={`Check out *${course.title}* (${course.badge}) at Javani Spiritual Hub`}
                  url={`/courses/${course.id}`}
                  imageUrl={course.image}
                />
              </div>

              {/* Extra / pre-req */}
              {course.extra && (
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wide bg-muted/50 px-3 py-2 rounded-md border border-border/50">
                  {course.extra}
                </p>
              )}

              {/* Description */}
              <p className="font-body font-light text-[0.95rem] sm:text-base text-muted-foreground leading-relaxed">
                {course.description}
              </p>

              {/* Meta chip */}
              {meta && (
                <div className="flex items-center gap-2 text-gold font-body text-sm">
                  <Award className="w-4 h-4" />
                  <span>{meta.detail}</span>
                </div>
              )}

              <div className="rounded-xl border border-gold/20 bg-gold/10 p-4">
                <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-gold">Course Fee</p>
                <p className="mt-1 font-display text-2xl font-bold text-primary">{getCourseDisplayPrice(course)}</p>
              </div>

              <div className="border-t border-border/50 pt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={buyCourse}
                  disabled={!purchasable}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-sm bg-gradient-primary text-primary-foreground font-body font-semibold text-base hover:brightness-110 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                >
                  <ShoppingBag className="w-5 h-5" /> {purchasable ? "Buy Course Now" : "Fee Will Be Updated Soon"}
                </button>
                {/* Enquire CTA */}
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-sm bg-[#25D366] text-white font-body font-semibold text-base hover:bg-[#128C7E] transition-colors shadow-sm"
                >
                  <MessageCircle className="w-5 h-5" /> Enquire on WhatsApp
                </a>

                <Link to="/contact">
                  <PrimaryButton compact className="w-full justify-center">
                    Know More + Enquire
                  </PrimaryButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default CourseDetail;
