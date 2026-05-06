import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import PrimaryButton from "@/components/PrimaryButton";
import SEO from "@/components/SEO";
import { Link, useNavigate } from "react-router-dom";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { MessageCircle, ArrowLeft } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";

type CourseCategory = "all" | "grades" | "diploma" | "pre-grade" | "masterclass-workshops" | "yoga" | "konnakol";

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

const filters: { label: string; value: CourseCategory }[] = [
  { label: "All Courses", value: "all" },
  { label: "Grades", value: "grades" },
  { label: "Diploma", value: "diploma" },
  { label: "Pre-Grade", value: "pre-grade" },
  { label: "Masterclass & Workshops", value: "masterclass-workshops" },
  { label: "Yoga", value: "yoga" },
  { label: "Konnakol", value: "konnakol" },
];

const badgeStyles: Record<string, string> = {
  red: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  charcoal: "bg-charcoal text-charcoal-foreground",
};

const SkeletonCard = () => (
  <div className="bg-card shadow-card rounded-lg overflow-hidden">
    <div className="aspect-[3/2] skeleton-shimmer" />
    <div className="p-5 sm:p-6 space-y-3">
      <div className="h-5 w-28 skeleton-shimmer rounded" />
      <div className="h-6 w-3/4 skeleton-shimmer rounded" />
      <div className="h-4 w-full skeleton-shimmer rounded" />
      <div className="h-4 w-2/3 skeleton-shimmer rounded" />
      <div className="h-10 w-40 skeleton-shimmer rounded" />
    </div>
  </div>
);

const ExtCourseCard = ({ course, delay = 0 }: { course: Course; delay?: number }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();
  const whatsappMsg = encodeURIComponent(
    `Hi, I'm interested in the *${course.title}* course (${course.badge}) at Javani Spiritual Hub.\n\n${course.description}${course.extra ? `\n${course.extra}` : ""}\n\nPlease share more details.`
  );

  return (
    <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: isVisible ? `${delay}s` : undefined }}>
      <Link to={`/courses/${course.id}`} className="block">
        <div className="bg-card shadow-card rounded-lg overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-hero group flex flex-col h-full">
        <div className="aspect-square sm:aspect-[3/2] relative overflow-hidden">
          {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
          <img src={course.image} alt={course.title} loading="lazy" onLoad={() => setImgLoaded(true)} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.06] ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          {course.status === "inactive" && (
            <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 text-xs font-body font-semibold rounded-full shadow-lg">
              Not Available
            </div>
          )}
          {/* Share button overlay */}
          <div className="absolute top-2 right-2">
            <ShareButton
              title={course.title}
              text={`Check out *${course.title}* (${course.badge}) at Javani Spiritual Hub`}
              url={`/courses/${course.id}`}
              className="bg-black/40 hover:bg-black/60 text-white hover:text-white rounded-full"
            />
          </div>
        </div>
        <div className="p-2.5 sm:p-6 flex flex-col flex-1">
          <span className={`inline-block px-2 py-0.5 text-[0.6rem] sm:text-xs font-body font-medium rounded-full mb-2 self-start ${badgeStyles[course.badgeColor] || badgeStyles.red}`}>{course.badge}</span>
          <h3 className="font-display font-semibold text-[0.75rem] sm:text-[1.4rem] text-foreground mb-2 sm:mb-4 transition-colors duration-300 group-hover:text-gold truncate">{course.title}</h3>
          <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3 flex-wrap mt-auto">
            <Link to="/contact" className="flex-1 min-w-[80px] sm:min-w-[120px]" onClick={(e) => e.stopPropagation()}>
              <PrimaryButton compact className="text-[0.65rem] sm:text-[0.85rem] w-full py-1.5 sm:py-2">Enquire</PrimaryButton>
            </Link>
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-sm bg-[#25D366] text-white font-body font-medium text-[0.65rem] sm:text-[0.8rem] hover:bg-[#128C7E] transition-colors"
            >
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">WhatsApp</span><span className="sm:hidden">WA</span>
            </a>
          </div>
        </div>
      </div>
      </Link>
    </div>
  );
};

const CourseSection = ({ category, title, description, courses, bgClass }: {
  category: string;
  title: string;
  description: string;
  courses: Course[];
  bgClass: string;
}) => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  return (
    <section className={`py-8 sm:py-12 md:py-16 ${bgClass}`} style={!bgClass ? { background: "hsl(var(--bg-section))" } : undefined}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text={category} className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-primary mb-3">{title}</h2>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-muted-foreground mb-10 sm:mb-12 max-w-2xl">{description}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-8">
          {courses.map((c, i) => <ExtCourseCard key={c.id} course={c} delay={i * 0.12} />)}
        </div>
      </div>
    </section>
  );
};

const tableData = [
  ["Duration", "Grade-based (1–5 yrs)", "Advanced (2 yrs)", "Flexible", "Intensive (1-3 days)", "Flexible sessions", "Progressive levels"],
  ["Certificate", "✅ Recognized", "✅ University-Linked", "❌ Not Applicable", "✅ Participation", "✅ On Completion", "✅ Grade-based"],
  ["Examination", "✅ Grade Exams", "✅ 4 semesters", "Internal exam", "❌ No Exam", "❌ No Exam", "✅ Level Tests"],
  ["Experience", "Beginners", "Intermediates", "Beginners", "All levels", "Beginners", "Intermediates"],
  ["Ideal For", "Serious learners", "Career artists", "Beginners, hobby", "Skill enhancement", "Wellness seekers", "Rhythm enthusiasts"],
];

const ComparisonTable = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();
  const whatsappMsg = encodeURIComponent(
    "Hi, I'm interested in learning more about your courses at Javani Spiritual Hub. Could you please share more details?"
  );

  return (
    <section className="py-16 sm:py-20 md:py-32 bg-background">
      <div ref={ref} className={`max-w-5xl mx-auto px-4 sm:px-6 ${isVisible ? "animate-fade-up" : "opacity-0"}`}>
        <SectionLabel text="FIND YOUR TRACK" className="mb-6" />
        <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">Which Course Is Right for You?</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Feature</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Grades</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Diploma</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Pre-Grade</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Masterclass</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Yoga</th>
                <th className="p-3 sm:p-4 text-left font-display font-semibold text-[0.85rem] sm:text-[0.95rem]">Konnakol</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-ivory" : "bg-card"}>
                  {row.map((cell, j) => (
                    <td key={j} className={`p-3 sm:p-4 border-l border-gold/10 ${j === 0 ? "font-display font-semibold text-foreground" : "font-body text-[0.8rem] sm:text-[0.9rem] text-muted-foreground"}`}>
                      {cell.startsWith("✅") ? (
                        <span><span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-600 text-center text-xs leading-5 mr-2">✓</span>{cell.slice(2)}</span>
                      ) : cell.startsWith("❌") ? (
                        <span><span className="inline-block w-5 h-5 rounded-full bg-red-50 text-red-400 text-center text-xs leading-5 mr-2">✗</span>{cell.slice(2)}</span>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-center mt-8 sm:mt-10">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PrimaryButton>Enquire About a Course</PrimaryButton>
          </a>
        </div>
      </div>
    </section>
  );
};

const Courses = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<CourseCategory>("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "courses"));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
      }
      setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, []);

  const gradesCourses = useMemo(() => courses.filter((c) => c.category === "grades"), [courses]);
  const diplomaCourses = useMemo(() => courses.filter((c) => c.category === "diploma"), [courses]);
  const preGradeCourses = useMemo(() => courses.filter((c) => c.category === "pre-grade"), [courses]);
  const masterclassCourses = useMemo(() => courses.filter((c) => c.category === "masterclass-workshops"), [courses]);
  const yogaCourses = useMemo(() => courses.filter((c) => c.category === "yoga"), [courses]);
  const konnakolCourses = useMemo(() => courses.filter((c) => c.category === "konnakol"), [courses]);

  const filteredGrades = useMemo(() => activeFilter === "all" || activeFilter === "grades" ? gradesCourses : [], [activeFilter, gradesCourses]);
  const filteredDiploma = useMemo(() => activeFilter === "all" || activeFilter === "diploma" ? diplomaCourses : [], [activeFilter, diplomaCourses]);
  const filteredPreGrade = useMemo(() => activeFilter === "all" || activeFilter === "pre-grade" ? preGradeCourses : [], [activeFilter, preGradeCourses]);
  const filteredMasterclass = useMemo(() => activeFilter === "all" || activeFilter === "masterclass-workshops" ? masterclassCourses : [], [activeFilter, masterclassCourses]);
  const filteredYoga = useMemo(() => activeFilter === "all" || activeFilter === "yoga" ? yogaCourses : [], [activeFilter, yogaCourses]);
  const filteredKonnakol = useMemo(() => activeFilter === "all" || activeFilter === "konnakol" ? konnakolCourses : [], [activeFilter, konnakolCourses]);
  const hasAny = filteredGrades.length + filteredDiploma.length + filteredPreGrade.length + filteredMasterclass.length + filteredYoga.length + filteredKonnakol.length > 0;

  useEffect(() => {
    document.body.classList.add("hide-nav-mobile");
    return () => document.body.classList.remove("hide-nav-mobile");
  }, []);

  return (
    <>
      <SEO
        title="Courses | Bharatanatyam, Kuchipudi, Carnatic Music & More | Javani Spiritual Hub"
        description="Explore grades, diploma, pre-grade, masterclass & workshops, yoga, and konnakol courses in classical Indian arts including Bharatanatyam, Kuchipudi, Carnatic Music, and more at Javani Spiritual Hub."
      />
      <main>
        {/* Mobile back arrow */}
        <button onClick={() => navigate(-1)} className="lg:hidden fixed top-4 left-4 z-[600] flex items-center justify-center w-10 h-10 rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <PageHero backgroundImages={[heroDancer1, heroDancer2, heroDancer3]} label="OUR COURSES" heading="Our Sacred Courses" subtext="Classical arts for every soul — from first steps to national certification." />

        <div className="sticky top-0 sm:top-[80px] z-[500] bg-card shadow-sm py-3 sm:py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center gap-2">
            {filters.map((f) => (
              <button key={f.value} onClick={() => setActiveFilter(f.value)} className={`px-4 sm:px-5 py-2 rounded-full font-body font-medium text-[0.8rem] sm:text-[0.875rem] transition-all duration-300 ${activeFilter === f.value ? "bg-gradient-primary text-primary-foreground" : "border border-ivory-dark text-muted-foreground hover:bg-ivory-dark"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <section className="py-16 sm:py-20 md:py-32 bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              {/* Loading - show nothing to avoid confusion */}
            </div>
          </section>
        ) : !hasAny && !loading ? (
          <div className="py-20 text-center">
            <p className="font-display text-xl text-muted-foreground">No courses available at the moment.</p>
          </div>
        ) : (
          <>
            {filteredGrades.length > 0 && (
              <CourseSection
                category="STRUCTURED LEARNING"
                title="Grades Courses"
                description="Complete a structured grade-based journey and earn recognized certification through progressive levels."
                courses={filteredGrades}
                bgClass="bg-background"
              />
            )}
            {filteredDiploma.length > 0 && (
              <CourseSection
                category="ADVANCED MASTERY"
                title="Diploma Courses"
                description="Deepen your mastery with advanced, university-linked diploma programs."
                courses={filteredDiploma}
                bgClass=""
              />
            )}
            {filteredPreGrade.length > 0 && (
              <CourseSection
                category="EXPLORE & DISCOVER"
                title="Pre-Grade Courses"
                description="Perfect for curious beginners, young children, or those exploring arts without formal examination pressure."
                courses={filteredPreGrade}
                bgClass="bg-background"
              />
            )}
            {filteredMasterclass.length > 0 && (
              <CourseSection
                category="INTENSIVE TRAINING"
                title="Masterclass & Workshops"
                description="Deep dive into specific techniques and practices with intensive masterclasses and focused workshops."
                courses={filteredMasterclass}
                bgClass=""
              />
            )}
            {filteredYoga.length > 0 && (
              <CourseSection
                category="MIND & BODY"
                title="Yoga Courses"
                description="Ancient practices for holistic wellness, combining physical postures, breathing techniques, and meditation."
                courses={filteredYoga}
                bgClass="bg-background"
              />
            )}
            {filteredKonnakol.length > 0 && (
              <CourseSection
                category="RHYTHMIC ARTS"
                title="Konnakol Courses"
                description="Master the art of South Indian vocal percussion through systematic practice and rhythmic recitation."
                courses={filteredKonnakol}
                bgClass=""
              />
            )}
          </>
        )}

        <ComparisonTable />
      </main>
      <div className="hidden sm:block"><Footer /></div>
    </>
  );
};

export default Courses;
