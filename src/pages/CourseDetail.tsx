import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import PrimaryButton from "@/components/PrimaryButton";
import { MessageCircle, ArrowLeft, Clock, Award, Users, CheckCircle } from "lucide-react";

interface Course {
  id: string;
  image: string;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  category: string;
  extra?: string;
  status: string;
}

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const categoryMeta: Record<string, { icon: React.ReactNode; detail: string }> = {
  grades: { icon: <Award className="w-4 h-4" />, detail: "Recognized Certification" },
  diploma: { icon: <Award className="w-4 h-4" />, detail: "University-Linked Certificate" },
  "pre-grade": { icon: <Users className="w-4 h-4" />, detail: "Beginner Friendly" },
  "masterclass-workshops": { icon: <Clock className="w-4 h-4" />, detail: "Intensive Sessions" },
  yoga: { icon: <CheckCircle className="w-4 h-4" />, detail: "Certificate on Completion" },
  konnakol: { icon: <Award className="w-4 h-4" />, detail: "Grade-based Levels" },
};

const CourseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { whatsappNumber } = useContactInfo();

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "courses", id))
      .then((snap) => {
        if (snap.exists()) setCourse({ id: snap.id, ...snap.data() } as Course);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

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

  const meta = categoryMeta[course.category];

  return (
    <>
      <SEO
        title={`${course.title} | Javani Spiritual Hub`}
        description={course.description}
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
                  {meta.icon}
                  <span>{meta.detail}</span>
                </div>
              )}

              <div className="border-t border-border/50 pt-5 flex flex-col gap-3">
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
