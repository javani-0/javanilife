import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useContactInfo } from "@/hooks/useContactInfo";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import GoldDivider from "@/components/GoldDivider";
import PrimaryButton from "@/components/PrimaryButton";
import SEO from "@/components/SEO";
import { ChevronDown, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroTemple from "@/assets/hero-temple.jpg";
import dancerPortrait from "@/assets/grading-main.jpg";
import dancerCloseup from "@/assets/grading-closeup.jpg";
import danceDetailFeet from "@/assets/grading-feet.jpg";

/* ───── Intro ───── */
const IntroSection = () => {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const handleLoad = (i: number) => setLoadedImages((prev) => new Set(prev).add(i));
  const { ref: imgRef, isVisible: imgVisible } = useScrollAnimation();
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();

  const images = [
    { src: dancerPortrait, alt: "Bharatanatyam dancer in red costume", className: "col-span-2 row-span-2 aspect-[4/5]", rotate: "" },
    { src: dancerCloseup, alt: "Dancer close-up portrait", className: "aspect-square", rotate: "-rotate-1" },
    { src: danceDetailFeet, alt: "Dancer feet with ankle bells", className: "aspect-[4/3]", rotate: "rotate-1" },
  ];

  return (
    <section className="py-8 sm:py-12 md:py-16 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[45%_1fr] gap-8 sm:gap-12 lg:gap-20 items-start">
        <div ref={imgRef} className={`relative ${imgVisible ? "animate-fade-left" : "opacity-0"}`}>
          <div className="absolute -inset-5 border-[3px] border-gold/20 -z-10 hidden lg:block" style={{ borderRadius: "2px" }} />
          <div className="grid grid-cols-2 gap-3">
            {images.map((img, i) => (
              <div key={i} className={`${img.className} ${img.rotate} overflow-hidden rounded-lg relative`}>
                {!loadedImages.has(i) && <div className="absolute inset-0 skeleton-shimmer" />}
                <img 
                  src={img.src} 
                  alt={img.alt} 
                  loading="lazy" 
                  onLoad={() => handleLoad(i)} 
                  className={`w-full h-full object-cover shadow-gold transition-all duration-500 hover:scale-[1.04] ${loadedImages.has(i) ? "opacity-100" : "opacity-0"}`}
                  style={i === 0 ? { objectPosition: "top center" } : undefined}
                />
              </div>
            ))}
          </div>
        </div>
        <div ref={textRef} className={`min-w-0 ${textVisible ? "animate-fade-right" : "opacity-0"}`}>
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.5rem] text-primary leading-tight mb-6">
            A Journey, Not Just a Grade
          </h2>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-4">
            At Javani, grading is more than an exam. It tracks holistic progress in technique, expression, rhythm, theory, and performance — a well-rounded development framework.
          </p>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-4">
            Each grade milestone prepares students not just for the next level, but for a deeper personal relationship with the art form itself.
          </p>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-8">
            Our grading system is aligned with national examination standards, giving your journey both spiritual and professional value.
          </p>
          <div className="space-y-4">
            <div className="border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg">
              <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-foreground break-words">🎓 <strong>University-Linked Certifications</strong> — Our grade examinations are linked with recognized universities and examination bodies, making your certificate valuable nationwide.</p>
            </div>
            <div className="border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg">
              <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-foreground break-words">📋 <strong>Structured Progression</strong> — Every grade has a defined syllabus, assessment criteria, and a clear milestone — so students always know their path forward.</p>
            </div>
            <div className="border-l-[3px] border-gold pl-4 sm:pl-5 py-3 bg-ivory rounded-r-lg">
              <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-foreground break-words">📜 <strong>Terms and Conditions</strong> — Please review our <Link to="/terms-and-conditions" className="text-gold hover:text-primary underline underline-offset-2 transition-colors duration-300">terms and conditions</Link> for enrollment, refunds, and examination policies.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───── Grading Ladder ───── */
const steps = [
  { badge: "G1/2", title: "Grade 1 & 2", level: "Beginner", desc: "Foundation of Kuchipudi through basic adavus, rhythm training, mudras, and introductory theory." },
  { badge: "G3/4", title: "Grade 3 & 4", level: "Elementary", desc: "Strengthening Kuchipudi technique with structured adavus, simple repertoire, and tala understanding." },
  { badge: "G5/6", title: "Grade 5 & 6", level: "Intermediate", desc: "Performance development through complete items, abhinaya training, and deeper theoretical knowledge." },
  { badge: "G7/8", title: "Grade 7 & 8", level: "Senior", desc: "Advanced technique and expressive mastery with traditional repertoire and refined laya control." },
  { badge: "G9/10", title: "Grade 9 & 10", level: "Advanced", desc: "Professional-level Kuchipudi excellence with major productions, manodharma, choreography, and comprehensive theory." },
  { badge: "RP", title: "Rangapravesham", level: "Debut Performance", desc: "Granted after completion of Senior/Advanced grades, full repertoire mastery, performance maturity, and Guru approval.", crown: true },
];

const LadderSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: stepsRef, isVisible: stepsVisible } = useScrollAnimation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -280 : 280, behavior: "smooth" });
  };

  return (
    <section className="py-8 sm:py-12 md:py-16" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="THE PROGRESSION PATH" className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-14">From First Step to Master Level</h2>
        </div>
        <div className="relative">
          {/* Left Arrow */}
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 -translate-x-1 sm:-translate-x-4 w-9 h-9 rounded-full bg-card shadow-md border border-gold/20 flex items-center justify-center text-gold hover:bg-gold hover:text-white transition-all duration-200 ${canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {/* Right Arrow */}
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 translate-x-1 sm:translate-x-4 w-9 h-9 rounded-full bg-card shadow-md border border-gold/20 flex items-center justify-center text-gold hover:bg-gold hover:text-white transition-all duration-200 ${canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        <div ref={(el) => { (stepsRef as React.MutableRefObject<HTMLDivElement | null>).current = el; scrollRef.current = el; }} onScroll={updateButtons} className={`overflow-x-auto pb-4 -mx-4 sm:mx-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${stepsVisible ? "animate-fade-up" : "opacity-0"}`}>
        <div className="flex gap-3 sm:gap-4 min-w-[1100px] px-4 sm:px-0">
          {steps.map((s, i) => (
            <div key={s.badge} className="flex items-start">
              <div className="bg-card shadow-card rounded-lg p-4 sm:p-6 w-[155px] sm:w-[175px] text-center hover:-translate-y-1 transition-all duration-300 relative">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-3 flex items-center justify-center font-accent text-xs sm:text-sm font-bold ${
                  (s as any).crown ? "bg-gold text-white ring-4 ring-gold/30" : "bg-gold/10 text-gold"
                }`}>
                  {(s as any).crown ? <Crown className="w-4 h-4 sm:w-5 sm:h-5" /> : s.badge}
                </div>
                <h3 className="font-display font-semibold text-[0.9rem] sm:text-[1rem] text-foreground mb-1">{s.title}</h3>
                <p className="font-body text-xs text-gold font-medium mb-2">{s.level}</p>
                <p className="font-body font-light text-[0.75rem] sm:text-[0.8rem] text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center px-1 pt-8">
                  <div className="w-4 sm:w-6 h-0.5 bg-gold/40" />
                  <div className="w-0 h-0 border-t-4 border-b-4 border-l-[6px] border-transparent border-l-gold/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
        </div>
        
        {/* CTA Button */}
        <div className="text-center mt-10 sm:mt-12">
          <Link to="/courses">
            <PrimaryButton>Explore Our Courses</PrimaryButton>
          </Link>
        </div>
    </div>
  </section>
  );
};

/* ───── JGP Fee Table ───── */
const jdpSemesters = [
  { level: "Semester I",   eligibility: "Minimum 10th Std Completion / 4 years' experience in Artform", fee: "₹ 29,200 + Tax" },
  { level: "Semester II",  eligibility: "Successful Completion of Semester I",  fee: "₹ 29,200 + Tax" },
  { level: "Semester III", eligibility: "Successful Completion of Semester II", fee: "₹ 29,200 + Tax" },
  { level: "Semester IV",  eligibility: "Successful Completion of Semester III",fee: "₹ 29,200 + Tax" },
];

const jdpProcessNotes = [
  "Once the Diploma admission is completed, study materials and individual Student ID login will be provided.",
  "Examination / Assessment schedule will be published prior to the examination date.",
  "After completion of each semester examination, results and Semester Completion Certificates will be issued within 30 days.",
  "Upon successful completion of all semesters (or four semesters in the case of lateral entry), candidates will be awarded the Diploma Completion Certificate.",
  "Diploma covers (Practical 1 / Practical 2 / Project / Dissertation).",
  "Demonstration audios & videos will be provided.",
  "Subject & notations Theory PDFs will be provided.",
  "Exam will be conducted in JAVANI SPIRITUAL HUB, Secunderabad.",
  "Exam will be conducted with live orchestra & according to the Training centre rules & regulations.",
  "Exam demonstration of students will be recorded for in-depth evaluation purposes.",
];

const jgpGrades = [
  { grade: "I",    eligibility: "5 Years / I Std Pass",    fee: "₹ 12K + Tax" },
  { grade: "II",   eligibility: "6 Years / II Std Pass",   fee: "₹ 15K + Tax" },
  { grade: "III",  eligibility: "7 Years / III Std Pass",  fee: "₹ 18K + Tax" },
  { grade: "IV",   eligibility: "8 Years / IV Std Pass",   fee: "₹ 21K + Tax" },
  { grade: "V",    eligibility: "9 Years / V Std Pass",    fee: "₹ 21K + Tax" },
  { grade: "VI",   eligibility: "10 Years / VI Std Pass",  fee: "₹ 24K + Tax" },
  { grade: "VII",  eligibility: "11 Years / VII Std Pass", fee: "₹ 24K + Tax" },
  { grade: "VIII", eligibility: "12 Years / VIII Std Pass",fee: "₹ 27K + Tax" },
  { grade: "IX",   eligibility: "13 Years / IX Std Pass",  fee: "₹ 27K + Tax" },
  { grade: "X",    eligibility: "14 Years / X Std Pass",   fee: "₹ 30K + Tax" },
];

const processNotes = [
  "Once the examination admission is completed, study materials and an ID card will be provided.",
  "Hall Ticket will be published prior to the examination date.",
  "After completion of the examination, results and Grade Completion Certificates will be issued within 30 days.",
  "Demonstration audios & videos will be provided.",
  "Subject & notations Theory PDFs will be provided.",
  "Exam will be conducted in JAVANI SPIRITUAL HUB, Secunderabad.",
  "Exam will be conducted with live orchestra & according to the Training centre rules & regulations.",
  "Exam demonstration of students will be recorded for in-depth evaluation purposes.",
];

const JGPSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: tableRef, isVisible: tableVisible } = useScrollAnimation();
  const { ref: notesRef, isVisible: notesVisible } = useScrollAnimation();
  const { ref: jdpHeaderRef, isVisible: jdpHeaderVisible } = useScrollAnimation();
  const { ref: jdpTableRef, isVisible: jdpTableVisible } = useScrollAnimation();
  const { ref: jdpNotesRef, isVisible: jdpNotesVisible } = useScrollAnimation();

  return (
    <section className="py-8 sm:py-12 md:py-16 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">

        {/* Collaboration Banner */}
        <div ref={headerRef} className={`text-center mb-10 ${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-3 bg-gold/10 border border-gold/30 rounded-full px-5 py-2 mb-6">
            <span className="text-gold text-xs sm:text-sm font-accent font-semibold tracking-widest uppercase">IAF &amp; ISO Approved</span>
          </div>
          <p className="font-body text-[0.85rem] sm:text-[0.95rem] text-muted-foreground mb-4 max-w-2xl mx-auto">
            In Collaboration with an authentic <span className="text-gold font-semibold">IAF, ISO Approved</span> Certificate Providing Center
          </p>
          <SectionLabel text="JAVANI GRADE PROGRAM (JGP)" className="mb-3" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-foreground leading-tight">
            Eligibility &amp; Examination Fees
          </h2>
        </div>

        {/* Fee Table */}
        <div ref={tableRef} className={`mb-12 overflow-x-auto rounded-xl shadow-[0_4px_30px_rgba(201,168,76,0.12)] border border-gold/20 ${tableVisible ? "animate-fade-up" : "opacity-0"}`}>
          <table className="w-full min-w-[480px] text-sm sm:text-base">
            <thead>
              <tr className="bg-gold text-white">
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase rounded-tl-xl">Grade</th>
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase">Eligibility</th>
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase rounded-tr-xl">Training &amp; Exam Fee<br /><span className="text-[10px] font-body font-normal opacity-80 normal-case tracking-normal">(Group Session)</span></th>
              </tr>
            </thead>
            <tbody>
              {jgpGrades.map((row, i) => (
                <tr
                  key={row.grade}
                  className={`border-b border-gold/10 transition-colors duration-200 hover:bg-gold/5 ${i % 2 === 0 ? "bg-card" : "bg-background"}`}
                >
                  <td className="py-3 px-4 sm:px-6">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gold/10 text-gold font-accent font-bold text-xs sm:text-sm">
                      {row.grade}
                    </span>
                  </td>
                  <td className="py-3 px-4 sm:px-6 font-body text-foreground text-[0.85rem] sm:text-[0.95rem]">{row.eligibility}</td>
                  <td className="py-3 px-4 sm:px-6 font-body font-semibold text-gold text-[0.9rem] sm:text-[1rem]">{row.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Process Notes */}
        <div ref={notesRef} className={`bg-card border border-gold/20 rounded-xl p-5 sm:p-8 shadow-card ${notesVisible ? "animate-fade-up" : "opacity-0"}`}>
          <p className="font-body font-semibold text-[0.95rem] sm:text-[1rem] text-red-400 mb-3">Note: -</p>
          <h3 className="font-display font-semibold text-[1.1rem] sm:text-[1.3rem] text-foreground mb-5 flex items-center gap-2">
            <span className="w-1 h-6 bg-gold rounded-full inline-block" />
            Process Information
          </h3>
          <ul className="space-y-3">
            {processNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-accent font-bold">{i + 1}</span>
                <span className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-foreground leading-relaxed">{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── JDP Section ── */}
        <div ref={jdpHeaderRef} className={`text-center mt-16 mb-10 ${jdpHeaderVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="JAVANI DIPLOMA PROGRAM (JDP)" className="mb-3" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-foreground leading-tight">
            Eligibility &amp; Fee Structure
          </h2>
        </div>

        {/* JDP Fee Table */}
        <div ref={jdpTableRef} className={`mb-12 overflow-x-auto rounded-xl shadow-[0_4px_30px_rgba(201,168,76,0.12)] border border-gold/20 ${jdpTableVisible ? "animate-fade-up" : "opacity-0"}`}>
          <table className="w-full min-w-[480px] text-sm sm:text-base">
            <thead>
              <tr className="bg-gold text-white">
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase rounded-tl-xl">Program Level</th>
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase">Eligibility</th>
                <th className="py-3 px-4 sm:px-6 font-accent font-semibold text-left text-xs sm:text-sm tracking-wider uppercase rounded-tr-xl">Training &amp; Exam Fee<br /><span className="text-[10px] font-body font-normal opacity-80 normal-case tracking-normal">(Group Session)</span></th>
              </tr>
            </thead>
            <tbody>
              {jdpSemesters.map((row, i) => (
                <tr key={row.level} className={`border-b border-gold/10 transition-colors duration-200 hover:bg-gold/5 ${i % 2 === 0 ? "bg-card" : "bg-background"}`}>
                  <td className="py-3 px-4 sm:px-6 font-body font-semibold text-foreground text-[0.85rem] sm:text-[0.95rem]">{row.level}</td>
                  <td className="py-3 px-4 sm:px-6 font-body text-foreground text-[0.85rem] sm:text-[0.95rem]">{row.eligibility}</td>
                  <td className="py-3 px-4 sm:px-6 font-body font-semibold text-gold text-[0.9rem] sm:text-[1rem]">{row.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* JDP Process Notes */}
        <div ref={jdpNotesRef} className={`bg-card border border-gold/20 rounded-xl p-5 sm:p-8 shadow-card mb-10 ${jdpNotesVisible ? "animate-fade-up" : "opacity-0"}`}>
          <p className="font-body font-semibold text-[0.95rem] sm:text-[1rem] text-red-400 mb-3">Note: -</p>
          <h3 className="font-display font-semibold text-[1.1rem] sm:text-[1.3rem] text-foreground mb-5 flex items-center gap-2">
            <span className="w-1 h-6 bg-gold rounded-full inline-block" />
            Process Information
          </h3>
          <ul className="space-y-3">
            {jdpProcessNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-accent font-bold">{i + 1}</span>
                <span className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-foreground leading-relaxed">{note}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
};

/* ───── Certificate Mockup ───── */
const CertificationSection = () => {
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();
  const { ref: certRef, isVisible: certVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();
  const whatsappMsg = encodeURIComponent(
    "Hi, I'd like to know more about the certification and grading system at Javani Spiritual Hub. Could you please provide details about the examination process, university-linked certifications, and how to get started?"
  );
  
  return (
  <section className="py-8 sm:py-12 md:py-16 bg-background">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-20 items-center">
      <div ref={textRef} className={`${textVisible ? "animate-fade-left" : "opacity-0"}`}>
        <SectionLabel text="WHAT YOU EARN" className="justify-start mb-6" />
        <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-primary leading-tight mb-8">
          Your Certificate, Recognized Nationally & Internationally
        </h2>
        <ul className="space-y-4 mb-8">
          {[
            "Issued by a recognized national examination board",
            "University-affiliated for higher-grade levels",
            "Accepted for government arts scholarships and competitions",
            "Digital + physical certificate provided",
            "Progressive record maintained — full transcript available",
          ].map((t) => (
            <li key={t} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">✓</span>
              <span className="font-body text-[0.9rem] sm:text-[0.95rem] text-foreground">{t}</span>
            </li>
          ))}
        </ul>
        <a
          href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PrimaryButton>Ask About Certification</PrimaryButton>
        </a>
      </div>
      <div ref={certRef} className={`flex flex-col items-center ${certVisible ? "animate-fade-right" : "opacity-0"}`}>
        <div className="rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(201,168,76,0.25)]" style={{ border: "3px double hsl(42,50%,54%)" }}>
          <img
            src="/demo-certificate.png"
            alt="Demo Certificate"
            className="w-full h-auto object-contain"
          />
        </div>
        <p className="mt-3 font-body text-xs sm:text-sm text-muted-foreground tracking-widest uppercase italic">* Demo certificate</p>
      </div>
    </div>
  </section>
  );
};

/* ───── Exam Process ───── */
const examSteps = [
  { num: "1", title: "Register for Grade", desc: "Inform our faculty of your readiness. They assess your current level and recommend your exam grade." },
  { num: "2", title: "Preparation Period", desc: "Dedicated preparation classes with your guru. Syllabus reviewed, recorded practice sessions, mock exams." },
  { num: "3", title: "Examination Day", desc: "Examination conducted at our academy by certified board examiners. Practical + theory components." },
  { num: "4", title: "Receive Certificate", desc: "Results within 60 days. Digital certificate immediately. Physical certificate by post within 90 days." },
];

const ExamProcessSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: stepsRef, isVisible: stepsVisible } = useScrollAnimation();
  return (
    <section className="py-8 sm:py-12 md:py-16" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="THE EXAM JOURNEY" className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-14">How Examinations Work</h2>
        </div>
        <div ref={stepsRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {examSteps.map((s, i) => (
          <div
            key={s.num}
            className={`relative group ${stepsVisible ? "animate-fade-up" : "opacity-0"}`}
            style={{ animationDelay: stepsVisible ? `${i * 0.15}s` : undefined }}
          >
            <div className="bg-card shadow-card rounded-lg p-5 sm:p-6 hover:-translate-y-1 hover:border-t-[3px] hover:border-gold border-t-[3px] border-transparent transition-all duration-300 h-full">
              <div className="w-10 h-10 rounded-full bg-gold text-white font-accent text-sm flex items-center justify-center mb-4">{s.num}</div>
              <h3 className="font-display font-semibold text-[1rem] sm:text-[1.1rem] text-foreground mb-2">{s.title}</h3>
              <p className="font-body font-light text-[0.85rem] sm:text-[0.9rem] text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
            {i < examSteps.length - 1 && (
              <div className="hidden lg:block absolute top-10 -right-3 z-10">
                <div className="w-0 h-0 border-t-4 border-b-4 border-l-[6px] border-transparent border-l-gold/40" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  </section>
  );
};

/* ───── Partners Section ───── */
interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  order: number;
}

const PartnersSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "partners"),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partner));
        setPartners(data.sort((a, b) => (a.order || 0) - (b.order || 0)));
        setLoading(false);
      },
      (err) => {
        console.error("[Partners Error]", err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  
  // Split partners evenly into two rows, each up to 8
  const shouldAnimate = partners.length >= 2;
  const halfPoint = Math.ceil(partners.length / 2);
  const firstRowPartners = partners.slice(0, Math.min(halfPoint, 8));
  const secondRowPartners = partners.slice(Math.min(halfPoint, 8));
  const showSecondRow = secondRowPartners.length > 0;
  const shouldAnimateSecondRow = secondRowPartners.length >= 2;
  
  // Duplicate arrays for seamless infinite scroll
  const firstRow = shouldAnimate ? [...firstRowPartners, ...firstRowPartners, ...firstRowPartners] : partners;
  const secondRow = shouldAnimateSecondRow ? [...secondRowPartners, ...secondRowPartners, ...secondRowPartners] : secondRowPartners;

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-14">
            <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-r from-transparent to-gold"></div>
            <span className="font-accent text-[0.85rem] sm:text-[0.95rem] tracking-[0.25em] uppercase text-gold">OUR PARTNERS</span>
            <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-l from-transparent to-gold"></div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="font-body text-muted-foreground">Loading partners...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-body text-muted-foreground">No partners to display</p>
          </div>
        ) : !shouldAnimate ? (
          /* Static centered grid when only 1 partner */
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            {partners.map((partner) => (
              <div
                key={partner.id}
                className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-8 py-6 min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300"
              >
                <img src={partner.logoUrl} alt={partner.name} className="h-12 w-auto object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Mobile: Static grid, top to bottom */}
            <div className="block md:hidden">
              <div className="grid grid-cols-2 gap-3">
                {partners.map((partner) => (
                  <div
                    key={partner.id}
                    className="flex items-center justify-center bg-card border border-gold/10 rounded-lg px-3 py-4 shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300"
                  >
                    <img src={partner.logoUrl} alt={partner.name} className="h-8 w-auto object-contain" />
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop: Animated infinite scroll */}
            <div className="hidden md:block">
              {/* First Row scrolling right */}
              <div className="relative mb-8 overflow-hidden">
                <div className="flex gap-6 md:gap-8 animate-scroll-right whitespace-nowrap">
                  {firstRow.map((partner, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-6 py-5 md:px-8 md:py-6 min-w-[180px] md:min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300"
                    >
                      <img src={partner.logoUrl} alt={partner.name} className="h-11 md:h-12 w-auto object-contain" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Second Row scrolling left */}
              {showSecondRow && (
                shouldAnimateSecondRow ? (
                  <div className="relative overflow-hidden">
                    <div className="flex gap-6 md:gap-8 animate-scroll-left whitespace-nowrap">
                      {secondRow.map((partner, i) => (
                        <div
                          key={i}
                          className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-6 py-5 md:px-8 md:py-6 min-w-[180px] md:min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300"
                        >
                          <img src={partner.logoUrl} alt={partner.name} className="h-11 md:h-12 w-auto object-contain" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
                    {secondRowPartners.map((partner) => (
                      <div
                        key={partner.id}
                        className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-8 py-6 min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300"
                      >
                        <img src={partner.logoUrl} alt={partner.name} className="h-12 w-auto object-contain" />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes scroll-right {
          0% {
            transform: translateX(-33.333%);
          }
          100% {
            transform: translateX(0%);
          }
        }

        @keyframes scroll-left {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }

        .animate-scroll-right {
          animation: scroll-right 12s linear infinite;
        }

        .animate-scroll-left {
          animation: scroll-left 12s linear infinite;
        }

        @media (min-width: 1024px) {
          .animate-scroll-right {
            animation: scroll-right 18s linear infinite;
          }

          .animate-scroll-left {
            animation: scroll-left 18s linear infinite;
          }
        }

        .animate-scroll-right:hover,
        .animate-scroll-left:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
};

/* ───── FAQ Accordion ───── */
const faqs = [
  { q: "At what age can a student appear for their first graded examination?", a: "Students can appear for Grade 1 from age 6 onwards, provided they have completed our Pre-Grade Foundation program and faculty assessment confirms readiness." },
  { q: "Is the certificate recognized outside Telangana?", a: "Yes. Our certifications are issued by national examination bodies and are recognized across India. Senior Diploma certifications are university-linked and accepted nationally." },
  { q: "How long does it take to complete all grades?", a: "Most students complete Grades 1–5 over 4–6 years with consistent practice. Timeline varies based on frequency of classes and individual progress." },
  { q: "Can adult learners also appear for certifications?", a: "Absolutely. There is no age limit for any grade. We have adult students earning their certifications alongside children, and many find it deeply fulfilling." },
  { q: "What happens if a student fails an exam?", a: "Students can re-appear in the next examination cycle. Our faculty will provide targeted guidance to strengthen areas that need improvement." },
];

const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: faqRef, isVisible: faqVisible } = useScrollAnimation();

  return (
    <section className="py-8 sm:py-12 md:py-16 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="COMMON QUESTIONS" className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">Grading FAQs</h2>
        </div>
        <div ref={faqRef} className={`space-y-3 sm:space-y-4 ${faqVisible ? "animate-fade-up" : "opacity-0"}`}>
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className={`bg-card shadow-sm rounded-lg overflow-hidden transition-all duration-300 ${isOpen ? "border-l-[3px] border-gold" : "border-l-[3px] border-transparent"}`}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-4 sm:p-5 md:p-6 text-left"
                >
                  <span className="font-display font-semibold text-[0.9rem] sm:text-[1rem] md:text-[1.1rem] text-foreground pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gold flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-60 pb-4 sm:pb-5 md:pb-6" : "max-h-0"}`}>
                  <p className="px-4 sm:px-5 md:px-6 font-body font-light text-[0.85rem] sm:text-[0.95rem] text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ───── Main Page ───── */
const Grading = () => (
  <>
    <SEO
      title="Grading System & Certification | Javani Spiritual Hub"
      description="Understand our university-linked certification and grade-based progression system. From foundation level to Senior Diploma and Arangetram."
    />
    <main>
      <PageHero
        backgroundImages={[heroDancer2, heroTemple, heroDancer1]}
        label="GRADES & DIPLOMA"
        heading="Understanding Our Grading System"
        subtext="A transparent, progressive, and internationally-aligned certification pathway."
      />
      <IntroSection />
      <LadderSection />
      <CertificationSection />
      <JGPSection />
      <ExamProcessSection />
      <PartnersSection />
      <FAQSection />
    </main>
    <Footer />
  </>
);

export default Grading;
