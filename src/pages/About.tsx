
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Faculty, getActiveFaculty } from "@/lib/faculty";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import GoldDivider from "@/components/GoldDivider";
import SEO from "@/components/SEO";
import { Eye, Flame, Sparkles, Instagram, Youtube, X } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";
import heroTemple from "@/assets/hero-temple.jpg";
import founderPhoto from "@/assets/ISW_4737.jpg";

/* ───── Fallback data ───── */
const fallbackHeroImages = [heroDancer1, heroTemple, heroDancer3];
const fallbackFounderImage = founderPhoto;

/* ───── Founder ───── */
const FounderSection = ({ founderImage }: { founderImage: string }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const { ref: imgRef, isVisible: imgVisible } = useScrollAnimation();
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();

  return (
    <section className="py-8 sm:py-12 md:py-16 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[4fr_5fr] gap-8 sm:gap-12 lg:gap-20 items-center">
        <div ref={imgRef} className={`relative ${imgVisible ? "animate-fade-left" : "opacity-0"}`}>
          <div className="absolute -inset-3 border-[4px] border-gold/30 pointer-events-none" style={{ borderRadius: "2px" }} />
          <div className="relative overflow-hidden aspect-[2/3]" style={{ borderRadius: "2px" }}>
            {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
            <img src={founderImage} alt="Founder" loading="lazy" onLoad={() => setImgLoaded(true)} className={`w-full h-full object-cover transition-all duration-700 hover:scale-[1.04] ${imgLoaded ? "opacity-100" : "opacity-0"}`} />
          </div>
          <div className="absolute bottom-6 right-6 bg-card shadow-card px-4 py-2 rounded-sm">
            <span className="font-display font-semibold text-gold text-sm">Founder & Guru</span>
          </div>
        </div>
        <div ref={textRef} className={`min-w-0 overflow-hidden ${textVisible ? "animate-fade-right" : "opacity-0"}`}>
          <SectionLabel text="A MESSAGE FROM THE FOUNDER" className="justify-start mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[2.8rem] text-primary leading-tight mb-4 break-words">Art is Devotion. Teaching is Service.</h2>
          <GoldDivider className="justify-start [&>div]:max-w-[80px] mb-8" />
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-loose mb-4">Javani Spiritual Hub was born from a deep reverence for India's classical performing arts traditions. I began this journey not just as a teacher, but as a lifelong student of these sacred arts.</p>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-loose mb-8">Every student who walks through our doors is not just learning technique — they are connecting with a heritage that spans thousands of years. My mission is to make that connection accessible, joyful, and transformative.</p>
          <div className="mb-2">
            <span className="font-display italic font-bold text-[1.8rem] sm:text-[2rem] text-primary">Guru Vanitha Haribabu</span>
            <svg width="120" height="8" viewBox="0 0 120 8" className="block mt-1"><path d="M0 4 Q30 0 60 4 Q90 8 120 4" fill="none" stroke="hsl(42,50%,54%)" strokeWidth="1.5" /></svg>
          </div>
          <p className="font-body font-light text-[0.9rem] text-muted-foreground">Founder & Principal | Javani Spiritual Hub</p>
        </div>
      </div>
    </section>
  );
};

/* ───── Vision / Mission / Values ───── */
const visionCards = [
  { icon: Eye, title: "Our Vision", text: "To be India's most trusted Spiritual Hub — by integrating Classical Arts, Herbal Wellness, Spiritual Education, and Dharmic Living into everyday life. We envision a generation grounded in discipline, devotion, and cultural pride — where Gurus are empowered, children are rooted in heritage, and tradition is lived every day." },
  { icon: Flame, title: "Our Mission", text: "To offer authentic classical training, holistic herbal wellness, spiritual learning tools, and traditional attire — while empowering Gurus and making dharmic living accessible and joyful for all." },
  { icon: Sparkles, title: "Our Values", text: "Devotion over performance. Discipline with joy. Respect for lineage. Inclusion for all ages. Excellence in every lesson." },
];

const VisionSection = () => {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-8 sm:py-12 md:py-16" style={{ background: "hsl(var(--bg-section))" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="WHAT DRIVES US" className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">Our Purpose</h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {visionCards.map((c, i) => (
            <div key={c.title} className={`bg-card shadow-card rounded-lg p-6 sm:p-8 text-center group hover:border-t-[3px] hover:border-gold border-t-[3px] border-transparent transition-all duration-300 ${isVisible ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: isVisible ? `${0.1 + i * 0.12}s` : undefined }}>
              <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-6">
                <c.icon className="w-7 h-7 text-gold" />
              </div>
              <h3 className="font-display font-semibold text-[1.2rem] sm:text-[1.4rem] text-primary mb-3">{c.title}</h3>
              <p className="font-body font-light text-[0.9rem] sm:text-[0.95rem] text-muted-foreground leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───── Timeline ───── */
const timelineItems = [
  { year: "2022", title: "Javani Spiritual Hub Founded", desc: "Started with 2 students in a small studio in Hyderabad, driven by a dream to preserve classical arts." },
  { year: "2024", title: "First Batch of Certified Students", desc: "Our inaugural batch of 12 students completed their Grade 1 certifications — a milestone that redefined our ambitions." },
  { year: "2025", title: "University-Linked Certification Introduced", desc: "Partnered with recognized examination boards to offer nationally accredited certifications to our students." },
  { year: "2026", title: "Diploma Programs, Gurus Empowerment & Javani Product Range Launched ", desc: "Expanded curriculum to include full Diploma programs in Kuchipudi & Nattuvangam — Gurus empowerment & Students certifications " },
  { year: "2026", title: "New Digital Platform Launch", desc: "Launching our official website to bring Javani's world-class teaching to every corner of India." },
 
];

const TimelineSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();

  return (
    <section className="py-8 sm:py-12 md:py-16 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <SectionLabel text="04 YEARS OF EXCELLENCE" className="mb-6" />
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-12 sm:mb-16">A Legacy Built Year by Year</h2>
        </div>

        <div className="relative">
          <div className="absolute left-4 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-0.5 border-l-2 border-dashed border-gold/40" />
          {timelineItems.map((item, i) => (
            <TimelineItem key={`${item.year}-${i}`} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

const TimelineItem = ({ item, index }: { item: typeof timelineItems[0]; index: number }) => {
  const { ref, isVisible } = useScrollAnimation();
  const anim = index % 2 === 0 ? "animate-fade-left" : "animate-fade-right";

  return (
    <div ref={ref} className={`relative flex mb-10 sm:mb-12 last:mb-0 ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} ${isVisible ? anim : "opacity-0"}`}>
      <div className="absolute left-4 md:left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-gold border-4 border-background z-10 mt-2" />
      <div className="hidden md:block md:w-1/2" />
      <div className={`ml-10 md:ml-0 md:w-1/2 ${index % 2 === 0 ? "md:pl-10" : "md:pr-10"}`}>
        <span className="inline-block font-accent text-[0.75rem] bg-gold text-white px-4 py-1 rounded-full mb-3">{item.year}</span>
        <div className="bg-card shadow-card rounded-lg p-5 sm:p-6">
          <h3 className="font-display font-semibold text-[1rem] sm:text-[1.1rem] text-foreground mb-2">{item.title}</h3>
          <p className="font-body font-light text-[0.85rem] sm:text-[0.9rem] text-muted-foreground leading-relaxed">{item.desc}</p>
        </div>
      </div>
    </div>
  );
};

/* ───── Faculty ───── */
const FacultySection = ({ faculty, loadingFaculty }: { faculty: Faculty[]; loadingFaculty: boolean }) => {
  const { ref, isVisible } = useScrollAnimation();
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);

  useEffect(() => {
    if (selectedFaculty) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedFaculty]);

  return (
    <>
      <section className="py-8 sm:py-12 md:py-16 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div ref={ref}>
            <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`}>
              <SectionLabel text="MEET THE GURUS" className="mb-6" />
            </div>
            <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.1s" : undefined }}>
              <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">The Teachers Behind the Transformation</h2>
            </div>
          </div>
          {loadingFaculty ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="font-body text-sm text-muted-foreground">Loading faculty...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
              {faculty.map((f, i) => (
              <div
                key={f.id}
                onClick={() => setSelectedFaculty(f)}
                className={`relative text-center p-4 sm:p-6 md:p-8 rounded-lg shadow-card bg-card hover:-translate-y-1.5 transition-all duration-300 group cursor-pointer ${isVisible ? "animate-elegant-rise" : "opacity-0"}`}
                style={{ 
                  animationDelay: isVisible ? `${0.15 + i * 0.15}s` : undefined
                }}
              >
                <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 mx-auto mb-4 sm:mb-5 rounded-full p-1 ring-[3px] ring-gold ring-offset-4 ring-offset-card overflow-hidden">
                  <img src={f.imageUrl} alt={f.name} loading="lazy" className="w-full h-full object-cover rounded-full group-hover:scale-[1.04] transition-transform duration-500" />
                </div>
                <h3 className="font-display font-bold text-[1rem] sm:text-[1.3rem] text-primary mb-1">{f.name}</h3>
                <p className="font-body font-medium text-[0.75rem] sm:text-[0.875rem] text-muted-foreground mb-2">{f.role}</p>
                
                {/* Mobile: Show "Know full details" link */}
                <button className="sm:hidden font-body text-[0.7rem] text-gold hover:text-gold-dark underline mb-2">Know full details</button>
                
                {/* Desktop: Show bio and social links */}
                <p className="font-body font-light text-[0.75rem] sm:text-[0.85rem] text-muted-foreground mb-4 hidden sm:block">{f.bio}</p>
                <div className="hidden sm:flex justify-center gap-3">
                  {f.instagram && (
                    <a href={f.instagram} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gold hover:text-gold-dark transition-colors">
                      <Instagram className="w-4 h-4" />
                    </a>
                  )}
                  {f.youtube && (
                    <a href={f.youtube} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gold hover:text-gold-dark transition-colors">
                      <Youtube className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      </section>

      {/* Faculty Detail Modal */}
      {selectedFaculty && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setSelectedFaculty(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-card rounded-xl shadow-hero max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedFaculty(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-charcoal/70 text-white hover:bg-charcoal transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="p-6 sm:p-8">
              <div className="w-32 h-32 mx-auto mb-6 rounded-full p-1 ring-[3px] ring-gold ring-offset-4 ring-offset-card overflow-hidden">
                <img src={selectedFaculty.imageUrl} alt={selectedFaculty.name} className="w-full h-full object-cover rounded-full" />
              </div>
              
              <h3 className="font-display font-bold text-[1.5rem] sm:text-[1.8rem] text-primary text-center mb-2">{selectedFaculty.name}</h3>
              <p className="font-body font-medium text-[0.95rem] sm:text-[1rem] text-muted-foreground text-center mb-6">{selectedFaculty.role}</p>
              
              <GoldDivider className="mb-6" />
              
              <p className="font-body font-light text-[0.9rem] sm:text-[0.95rem] text-foreground leading-relaxed mb-6">{selectedFaculty.bio}</p>
              
              {(selectedFaculty.instagram || selectedFaculty.youtube) && (
                <div className="flex justify-center gap-4">
                  {selectedFaculty.instagram && (
                    <a href={selectedFaculty.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full border border-gold/60 text-gold hover:bg-gold hover:text-white transition-all duration-300">
                      <Instagram className="w-5 h-5" />
                    </a>
                  )}
                  {selectedFaculty.youtube && (
                    <a href={selectedFaculty.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full border border-gold/60 text-gold hover:bg-gold hover:text-white transition-all duration-300">
                      <Youtube className="w-5 h-5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

/* ───── Why Javani ───── */
const whyPoints = [
  { icon: "🏛️", title: "Authentic Lineage", desc: "Our teaching methods trace directly to traditional guru-shishya parampara." },
  { icon: "📜", title: "Nationally Recognized Certifications", desc: "Earn grades and diplomas recognized by leading examination boards." },
  { icon: "🌟", title: "Expert Faculty", desc: "Learn from seasoned gurus with decades of performance and teaching experience." },
  { icon: "🕐", title: "Flexible Scheduling", desc: "Morning, evening, and weekend batches designed for students and working professionals." },
  { icon: "👨‍👩‍👧", title: "All Ages Welcome", desc: "Programs for children from age 5, teenagers, adults, and senior learners." },
  { icon: "💬", title: "Personal Counselling", desc: "Every student receives a personalized guidance session before enrollment." },
];

const WhySection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollAnimation();

  return (
    <section className="relative py-8 sm:py-12 md:py-16 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroTemple})` }} />
      <div className="absolute inset-0 bg-[#1A0A0A]/80" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={ref}>
          <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`}>
            <SectionLabel text="WHY CHOOSE US" className="mb-6 [&_span]:text-gold-light [&_div]:bg-gold-light" />
          </div>
          <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.1s" : undefined }}>
            <h2 className="font-display font-bold text-[1.8rem] sm:text-[2rem] md:text-[3.5rem] text-white text-center mb-10 sm:mb-14">What Makes Us Different</h2>
          </div>
        </div>
        <div ref={cardsRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {whyPoints.map((p, i) => (
            <div key={p.title} className={`flex gap-4 ${cardsVisible ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: cardsVisible ? `${i * 0.15}s` : undefined }}>
              <span className="text-[1.8rem] sm:text-[2rem] flex-shrink-0 mt-1">{p.icon}</span>
              <div>
                <h3 className="font-display font-bold text-white text-[1rem] sm:text-[1.1rem] mb-1">{p.title}</h3>
                <p className="font-body font-light text-white/70 text-[0.85rem] sm:text-[0.9rem] leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───── About Page ───── */
const About = () => {
  const [heroImages, setHeroImages] = useState<string[]>(fallbackHeroImages);
  const [founderImage, setFounderImage] = useState<string>(fallbackFounderImage);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loadingFaculty, setLoadingFaculty] = useState(true);

  useEffect(() => {
    const fetchAboutData = async () => {
      try {
        const snap = await getDoc(doc(db, "siteSettings", "aboutPage"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.heroImages?.length > 0) setHeroImages(data.heroImages);
          if (data.founderImage) setFounderImage(data.founderImage);
        }
      } catch (err) {
        console.error("Error fetching about page data:", err);
      }
    };

    const fetchFaculty = async () => {
      try {
        setLoadingFaculty(true);
        const activeFaculty = await getActiveFaculty();
        setFaculty(activeFaculty);
        console.log("[About Page] Loaded faculty:", activeFaculty.length);
      } catch (err) {
        console.error("[About Page] Error fetching faculty:", err);
      } finally {
        setLoadingFaculty(false);
      }
    };

    fetchAboutData();
    fetchFaculty();
  }, []);

  return (
    <>
      <SEO
        title="About Us | Javani Spiritual Hub — 12+ Years of Classical Arts Excellence"
        description="Learn about Javani Spiritual Hub — our story, our founder, our faculty, and our 12+ year journey of preserving and teaching India's classical performing arts."
      />
      <main>
        <PageHero backgroundImages={heroImages} label="OUR STORY" heading="The Soul Behind Javani" breadcrumb={[{ label: "Home" }, { label: "About Us" }]} />
        <FounderSection founderImage={founderImage} />
        <VisionSection />
        <TimelineSection />
        <FacultySection faculty={faculty} loadingFaculty={loadingFaculty} />
        <WhySection />
      </main>
      <Footer />
    </>
  );
};

export default About;
