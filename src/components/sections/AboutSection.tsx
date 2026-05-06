import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import GoldDivider from "../GoldDivider";
import GoldOutlineButton from "../GoldOutlineButton";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import dancerPortrait from "@/assets/ISW_5259.jpg";
import templeGopuram from "@/assets/_W0A7189.jpg";
import danceDetailFeet from "@/assets/6W0A5840.jpg";

const features = [
  { icon: "🎭", title: "Nationally Accredited Curriculum", desc: "Recognized by leading cultural institutions" },
  { icon: "🏆", title: "University-Linked Certifications", desc: "Partnered with renowned universities" },
  { icon: "🎓", title: "Diploma & Pre-Grade Programs", desc: "Structured pathways for every level" },
  { icon: "🌸", title: "Holistic Arts Education", desc: "Mind, body, and spirit in harmony" },
];

const fallbackImages = [
  { src: dancerPortrait, alt: "Bharatanatyam dancer performing on stage", className: "col-span-2 row-span-2 aspect-[4/5]", rotate: "" },
  { src: templeGopuram, alt: "South Indian temple gopuram", className: "aspect-square", rotate: "-rotate-1" },
  { src: danceDetailFeet, alt: "Dancer feet with ghungroo ankle bells", className: "aspect-[4/3]", rotate: "rotate-1" },
];

const AboutSection = () => {
  const [images, setImages] = useState(fallbackImages);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const handleLoad = (i: number) => setLoadedImages((prev) => new Set(prev).add(i));
  const { ref: sectionRef, isVisible: sectionVisible } = useScrollAnimation({ threshold: 0.15 });

  useEffect(() => {
    const fetchAboutImages = async () => {
      try {
        const snap = await getDoc(doc(db, "siteSettings", "about"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.images && data.images.length > 0) {
            setImages(data.images.map((img: any, i: number) => ({
              src: img.src,
              alt: img.alt || fallbackImages[i]?.alt || "",
              className: fallbackImages[i]?.className || "",
              rotate: fallbackImages[i]?.rotate || "",
            })));
          }
        }
      } catch (err) {
        console.error("Error fetching about images:", err);
      }
    };
    fetchAboutImages();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 sm:py-20 md:py-32 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className={`${sectionVisible ? "animate-scale-in" : "opacity-0"}`}>
          <SectionLabel text="OUR LEGACY" className="mb-6" />
        </div>
        <div className={`${sectionVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: sectionVisible ? "0.1s" : undefined }}>
          <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center max-w-[700px] mx-auto mb-4">
            Preserving the Sacred. Teaching the Timeless.
          </h2>
        </div>
        <div className={`${sectionVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: sectionVisible ? "0.2s" : undefined }}>
          <GoldDivider className="mb-12 sm:mb-16" />
        </div>

        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-start">
          {/* Image collage */}
          <div className={`relative ${sectionVisible ? "animate-fade-left" : "opacity-0"}`} style={{ animationDelay: sectionVisible ? "0.5s" : undefined }}>
            <div className="absolute -inset-5 border-[3px] border-gold/20 -z-10 hidden lg:block" style={{ borderRadius: "2px" }} />
            <div className="grid grid-cols-2 gap-3">
              {images.map((img, i) => (
                <div key={i} className={`${img.className} ${img.rotate} overflow-hidden rounded-lg relative`}>
                  {!loadedImages.has(i) && <div className="absolute inset-0 skeleton-shimmer" />}
                  <img src={img.src} alt={img.alt} loading="lazy" onLoad={() => handleLoad(i)} className={`w-full h-full object-cover shadow-gold transition-all duration-500 hover:scale-[1.04] ${loadedImages.has(i) ? "opacity-100" : "opacity-0"}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Text content */}
          <div className={`min-w-0 ${sectionVisible ? "animate-fade-right" : "opacity-0"}`} style={{ animationDelay: sectionVisible ? "0.5s" : undefined }}>
            <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-4">
              Javani Spiritual Hub was founded with a singular vision — to preserve and propagate the sacred classical arts of India in their most authentic form.
            </p>
            <p className="font-body font-light text-[0.95rem] sm:text-[1rem] text-foreground leading-relaxed mb-8">
              Over 12 years, we have nurtured hundreds of students — from curious beginners to national-level performers — through structured, heart-centered teaching.
            </p>

            <div className="space-y-0">
              {features.map((f, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-4 py-4 ${i < features.length - 1 ? "border-b border-ivory-dark" : ""}`}
                >
                  <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-lg flex-shrink-0">
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display font-semibold text-[1rem] text-foreground">{f.title}</h4>
                    <p className="font-body font-light text-[0.875rem] text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Link to="/about"><GoldOutlineButton className="mt-8">Our Full Story</GoldOutlineButton></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
