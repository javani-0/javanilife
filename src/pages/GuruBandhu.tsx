import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import GoldDivider from "@/components/GoldDivider";
import PrimaryButton from "@/components/PrimaryButton";
import GoldOutlineButton from "@/components/GoldOutlineButton";
import SEO from "@/components/SEO";
import { GraduationCap, Monitor, BookOpen, IndianRupee, Sparkles, Trophy, Theater, Heart, Briefcase, MessageCircle } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useContactInfo } from "@/hooks/useContactInfo";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroTemple from "@/assets/hero-temple.jpg";
import dancerPortrait from "@/assets/dancer-portrait-1.jpg";

/* ───── Program Overview ───── */
const OverviewSection = () => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { ref: imgRef, isVisible: imgVisible } = useScrollAnimation();
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();
  const [visibleBoxes, setVisibleBoxes] = useState<Set<number>>(new Set());
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Individual intersection observer for each info box
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    boxRefs.current.forEach((box, index) => {
      if (!box) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleBoxes((prev) => new Set(prev).add(index));
            observer.unobserve(box);
          }
        },
        { threshold: 0.2 }
      );

      observer.observe(box);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[45%_1fr] gap-8 sm:gap-12 lg:gap-20 items-center">
        <div ref={imgRef} className={`relative ${imgVisible ? "animate-fade-left" : "opacity-0"}`}>
          <div className="absolute -inset-3 border-[4px] border-gold/30 pointer-events-none" style={{ borderRadius: "2px" }} />
          <div className="relative overflow-hidden aspect-[3/4]" style={{ borderRadius: "2px" }}>
            {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
            <img src={dancerPortrait} alt="Javani Bandhathuvum Program" loading="lazy" onLoad={() => setImgLoaded(true)} className={`w-full h-full object-cover transition-opacity duration-700 ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          </div>
        </div>
        <div ref={textRef} className={`min-w-0 ${textVisible ? "animate-fade-right" : "opacity-0"}`}>
          <SectionLabel text="Javani BANDHATHUVUM PROGRAM" className="justify-start mb-4" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.5rem] text-primary leading-tight mb-4">
            Program Overview & Structure
          </h2>
          <GoldDivider className="justify-start [&>div]:max-w-[80px] mb-6" />
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-4">
            The <strong>Javani Bandhathuvum Program</strong> is a comprehensive affiliation framework designed to empower classical arts academies and Gurus across India. It provides structured academic support, digital infrastructure, revenue opportunities, and cultural preservation — all under the organized umbrella of <strong>Javani Spiritual Hub</strong>.
          </p>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-8">
            From certification and student management to product distribution and Guru recognition — this program equips affiliated academies with everything they need to thrive, sustain, and grow.
          </p>
          <div className="space-y-4">
            <div 
              ref={(el) => (boxRefs.current[0] = el)}
              className={`border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg overflow-hidden ${visibleBoxes.has(0) ? "sm:animate-fade-up animate-cursor-reveal-with-cursor" : "opacity-0"}`}
            >
              <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-foreground break-words">🔱 <strong>For Academies</strong> — Get structured certification, digital tools, revenue streams, and full institutional support.</p>
            </div>
            <div 
              ref={(el) => (boxRefs.current[1] = el)}
              className={`border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg overflow-hidden ${visibleBoxes.has(1) ? "sm:animate-fade-up animate-cursor-reveal-with-cursor" : "opacity-0"}`}
            >
              <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-foreground break-words">🎓 <strong>For Students</strong> — Access standardized curriculum, official ID, graded examinations, and recognized certifications.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───── Program Pillars Section ───── */
const programPillars = [
  {
    icon: GraduationCap,
    emoji: "🔱",
    title: "Academic & Certification Support",
    desc: "Javani provides structured Grade and Diploma examination support through recognized exam center tie-ups, ensuring academic credibility and standardized evaluation.",
    extra: "Affiliated academies are officially authorized to conduct examinations under the Javani framework.",
  },
  {
    icon: Monitor,
    emoji: "💻",
    title: "Cloud-Based Student Management System",
    desc: "Every affiliated teacher receives secure login access to enroll students, track academic progress, maintain records, and download hall tickets through a structured digital platform.",
    extra: "The system provides complete administrative support, digital record management, examination coordination assistance, and streamlined hall ticket processing for Grade and Diploma examinations.",
  },
  {
    icon: BookOpen,
    emoji: "📚",
    title: "Syllabus Books & Student ID System",
    desc: "Javani supplies structured syllabus books and official student ID cards to ensure uniform curriculum and academic identity.",
    extra: "This system strengthens discipline, documentation, and institutional recognition.",
  },
  {
    icon: IndianRupee,
    emoji: "💰",
    title: "Revenue Support Through Product Distribution",
    desc: "Affiliated academies can generate additional income by offering spiritual educational toys, books, practice sarees, costumes, and herbal wellness products.",
    extra: "This initiative helps academies create sustainable parallel revenue streams.",
  },
  {
    icon: Sparkles,
    emoji: "🎓",
    title: "Workshops, Masterclasses & Camps",
    desc: "The Javani team conducts Kuchipudi, Konnakol, and Nattuvangam workshops at affiliated academies to enhance technical excellence and revenue opportunities.",
    extra: "These programs strengthen student exposure while supporting academy growth.",
  },
  {
    icon: Trophy,
    emoji: "🏆",
    title: "Competitions & Cash Prize Recognition",
    desc: "Javani organizes structured competitions and national-level events exclusively for affiliated academy students.",
    extra: "Winners receive recognition certificates and cash prizes to motivate excellence.",
  },
  {
    icon: Theater,
    emoji: "🎭",
    title: "Guru Empowerment & Stage Recognition",
    desc: "Affiliated teachers receive opportunities to recite Nattuvangam on stage with live orchestra and gain public recognition.",
    extra: "This restores Guru dignity and establishes leadership presence within the network.",
  },
  {
    icon: Heart,
    emoji: "🌺",
    title: "Scholarship & Student Upliftment",
    desc: "Economically weak yet talented students receive sponsorship for exam fees, costumes, and Gajja Pooja with ₹11 dakshina blessings.",
    extra: "This initiative ensures inclusive growth rooted in dharma.",
  },
];

const ProgramPillarsSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set());
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Individual intersection observer for each card
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    cardRefs.current.forEach((card, index) => {
      if (!card) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleCards((prev) => new Set(prev).add(index));
            // Once visible, stop observing to prevent blinking
            observer.unobserve(card);
          }
        },
        { threshold: 0.15 }
      );

      observer.observe(card);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []);

  return (
    <section className="py-12 sm:py-16 md:py-20" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="PROGRAM STRUCTURE" className="mb-4" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-6 sm:mb-8">
            8 Pillars of the Bandhathuvum Program
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5 sm:gap-6">
          {programPillars.map((p, i) => (
            <div
              key={p.title}
              ref={(el) => (cardRefs.current[i] = el)}
              className={`bg-card shadow-card rounded-lg p-6 sm:p-8 group hover:border-l-[4px] hover:border-gold border-l-[4px] border-transparent transition-all duration-300 ${visibleCards.has(i) ? "sm:animate-fade-up animate-cursor-reveal-vertical" : "opacity-0"}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
                  <p.icon className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-[1rem] sm:text-[1.15rem] text-primary mb-2">
                    <span className="mr-1">{p.emoji}</span> {i + 1}. {p.title}
                  </h3>
                  <p className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-foreground leading-relaxed mb-2">{p.desc}</p>
                  <p className="font-body font-light text-[0.8rem] sm:text-[0.88rem] text-muted-foreground leading-relaxed italic">{p.extra}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───── Gurus Business Wing ───── */
const GurusBusinessSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const products = [
    "Spiritual Educational Toys",
    "Dance Practice Sarees & Costumes",
    "Herbal Drinks & Wellness Beverages",
    "Classical Dance Theory Books",
    "Spiritual Learning Materials",
  ];

  // Individual intersection observer for the card
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setCardVisible(true);
          observer.unobserve(card);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="GURU EMPOWERMENT" className="mb-4" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-3">
            💼 Gurus Business Wing
          </h2>
          <p className="font-body text-[1rem] sm:text-[1.1rem] text-gold font-medium text-center mb-6 sm:mb-8">Zero Investment Opportunity</p>
        </div>
        <div 
          ref={cardRef}
          className={`bg-card shadow-card rounded-xl p-6 sm:p-10 ${cardVisible ? "sm:animate-fade-up animate-cursor-reveal-vertical" : "opacity-0"}`}
        >
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-6">
            Affiliated Gurus are empowered to expand into structured product distribution without initial capital investment.
          </p>
          <h4 className="font-display font-semibold text-[1rem] text-primary mb-4">Product Categories Include:</h4>
          <ul className="space-y-3 mb-8">
            {products.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="w-2 h-2 rounded-full bg-gold mt-2 flex-shrink-0" />
                <span className="font-body text-[0.9rem] sm:text-[0.95rem] text-foreground">{p}</span>
              </li>
            ))}
          </ul>
          <div className="border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg">
            <p className="font-body font-light text-[0.85rem] sm:text-[0.92rem] text-muted-foreground leading-relaxed">
              This initiative enables Gurus to build additional income streams, strengthen academy sustainability, and promote spiritually aligned educational products within their student community — all under the organized support of <strong className="text-foreground">JAVANI SPIRITUAL HUB</strong>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───── Financial Structure ───── */
const FinancialSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const alertRef = useRef<HTMLDivElement>(null);
  const [alertVisible, setAlertVisible] = useState(false);

  // Intersection observer for the alert box
  useEffect(() => {
    const alert = alertRef.current;
    if (!alert) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAlertVisible(true);
          observer.unobserve(alert);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(alert);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-12 sm:py-16 md:py-20" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="AFFILIATION DETAILS" className="mb-4" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-6">
            💼 Financial Structure Summary
          </h2>
        </div>
        <div className={`bg-card shadow-card rounded-xl p-6 sm:p-8 ${isVisible ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: "0.15s" }}>
          <p className="font-body font-light text-[0.88rem] sm:text-[0.95rem] text-foreground leading-relaxed mb-3">
            This structured contribution supports digital infrastructure, academic monitoring, administrative services, event organization, and overall ecosystem development — ensuring sustainability, transparency, and long-term growth of the Kuchipudi network.
          </p>
          <div 
            ref={alertRef}
            className={`border-l-[3px] border-primary pl-4 sm:pl-5 py-3 bg-primary/5 rounded-r-lg overflow-hidden ${alertVisible ? "sm:animate-fade-up animate-cursor-reveal-with-cursor" : "opacity-0"}`}
          >
            <p className="font-body font-medium text-[0.85rem] sm:text-[0.92rem] text-primary leading-relaxed">
              <strong>Important:</strong> Examination fees for Grade and Diploma assessments must be paid separately. Hall tickets will be generated and issued only upon receipt of the applicable examination fee.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───── CTA Section ───── */
const CTASection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();

  return (
    <section className="relative py-12 sm:py-16 md:py-20 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroTemple})` }} />
      <div className="absolute inset-0 bg-[#1A0A0A]/85" />
      <div ref={ref} className={`relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center ${isVisible ? "animate-scale-in" : "opacity-0"}`}>
        <Sparkles className="w-10 h-10 text-gold mx-auto mb-6" />
        <h2 className="font-display font-bold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-white mb-4">
          Join the Javani Bandhathuvum Network
        </h2>
        <p className="font-body font-light text-[0.95rem] sm:text-[1.05rem] text-white/75 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
          Affiliate your academy with Javani Spiritual Hub and unlock structured growth, academic credibility, and sustainable revenue for your institution.
        </p>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
          <Link to="/contact">
            <PrimaryButton>Affiliate / Enquire Now</PrimaryButton>
          </Link>
          <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
            <GoldOutlineButton variant="white" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> WhatsApp Us
            </GoldOutlineButton>
          </a>
        </div>
      </div>
    </section>
  );
};

/* ───── Main Page ───── */
const GuruBandhu = () => (
  <>
    <SEO
      title="Guru Bandhu | Javani Bandhathuvum Program | Javani Spiritual Hub"
      description="The Javani Bandhathuvum Program empowers classical arts academies with certification support, digital management, product distribution, workshops, and Guru recognition — all under Javani Spiritual Hub."
    />
    <main>
      <PageHero
        backgroundImages={[heroDancer1, heroTemple, heroDancer2]}
        label="GURU BANDHU"
        heading="Javani Bandhathuvum Program"
        subtext="Empowering Gurus, strengthening academies, and preserving the sacred classical arts tradition through structured support and recognition."
        breadcrumb={[{ label: "Home", path: "/" }, { label: "Guru Bandhu" }]}
      />
      <OverviewSection />
      <ProgramPillarsSection />
      <GurusBusinessSection />
      <FinancialSection />
      <CTASection />
    </main>
    <Footer />
  </>
);

export default GuruBandhu;
