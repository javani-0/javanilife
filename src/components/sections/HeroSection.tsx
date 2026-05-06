import { useState, useEffect, useCallback, useRef } from "react";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import PrimaryButton from "../PrimaryButton";
import GoldOutlineButton from "../GoldOutlineButton";
import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroTemple from "@/assets/hero-temple.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";

const fallbackImages = [heroDancer1, heroDancer2, heroTemple, heroDancer3];

const HeroSection = () => {
  const [heroImages, setHeroImages] = useState<string[]>(fallbackImages);
  const [currentImage, setCurrentImage] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [cursorStyle, setCursorStyle] = useState<React.CSSProperties>({});
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const words = ["Where Tradition Lives.", "Where Gurus Grow.", "Where Culture Blossoms"];

  useEffect(() => {
    const fetchHeroImages = async () => {
      try {
        const snap = await getDoc(doc(db, "siteSettings", "hero"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.images && data.images.length > 0) {
            setHeroImages(data.images);
          }
        }
      } catch (err) {
        console.error("Error fetching hero images:", err);
      }
    };
    fetchHeroImages();
  }, []);

  // Update cursor position - plays once only
  useEffect(() => {
    const updateCursor = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      
      let targetLine = -1;
      if (elapsed >= 300 && elapsed < 1300) targetLine = 0;
      else if (elapsed >= 1300 && elapsed < 2300) targetLine = 1;
      else if (elapsed >= 2300 && elapsed < 3500) targetLine = 2;
      
      if (targetLine >= 0 && lineRefs.current[targetLine]) {
        const rect = lineRefs.current[targetLine]!.getBoundingClientRect();
        setCursorStyle({
          top: `${rect.top}px`,
          left: `${rect.right + 4}px`,
        });
      }
    };

    const startTime = Date.now();
    updateCursor();
    const interval = setInterval(updateCursor, 50);
    
    // Stop cursor updates after animation completes (3.5 seconds)
    const stopTimeout = setTimeout(() => {
      clearInterval(interval);
      setCursorStyle({ display: 'none' });
    }, 3500);
    
    return () => {
      clearInterval(interval);
      clearTimeout(stopTimeout);
    };
  }, []);

  const nextImage = useCallback(() => {
    setCurrentImage((prev) => (prev + 1) % heroImages.length);
  }, [heroImages.length]);

  useEffect(() => {
    const timer = setInterval(nextImage, 6000);
    return () => clearInterval(timer);
  }, [nextImage]);

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Sliding background images */}
      {heroImages.map((img, i) => (
        <div
          key={i}
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${img})`,
            opacity: currentImage === i && loadedImages.has(i) ? 1 : 0,
            transform: currentImage === i ? "scale(1.08)" : "scale(1)",
            transition: "opacity 1.2s ease-in-out, transform 7s ease-out",
          }}
        />
      ))}

      {/* Preload */}
      {heroImages.map((img, i) => (
        <img
          key={`preload-${i}`}
          src={img}
          alt=""
          className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
          onLoad={() => setLoadedImages((prev) => new Set(prev).add(i))}
        />
      ))}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1A0A0A]/85 via-[#1A0A0A]/60 to-[#1A0A0A]/40" />

      {/* Bottom wave divider - flattened to sit below content */}
      <div className="absolute -bottom-1 left-0 right-0 z-[5]">
        <svg viewBox="0 0 1440 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0 50L0 30C240 10 480 5 720 12C960 20 1200 35 1440 28L1440 50L0 50Z" fill="hsl(var(--background))" />
          <path d="M0 30C240 10 480 5 720 12C960 20 1200 35 1440 28" stroke="hsl(var(--gold) / 0.3)" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Subtle mandala pattern */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='100' cy='100' r='80' fill='none' stroke='%23C9A84C' stroke-width='0.5'/%3E%3Ccircle cx='100' cy='100' r='60' fill='none' stroke='%23C9A84C' stroke-width='0.5'/%3E%3Ccircle cx='100' cy='100' r='40' fill='none' stroke='%23C9A84C' stroke-width='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-36 sm:pt-28 pb-28 sm:pb-32 lg:pt-24 lg:pb-0 lg:min-h-screen flex items-center">
        <div className="w-full max-w-2xl">
          <h1 className="mb-4 sm:mb-6 relative">
            {words.map((word, i) => (
              <span
                key={i}
                className={`block font-display leading-[1.1] ${
                  i === 2
                    ? "font-bold text-gold-light text-[1.75rem] sm:text-[2.5rem] md:text-[3.4rem] lg:text-[3.3rem]"
                    : "font-light text-white text-[1.8rem] sm:text-[2.5rem] md:text-[3.5rem] lg:text-[3.4rem]"
                }`}
                style={{ 
                  ...(i === 2 ? { textShadow: "0 2px 30px rgba(201,168,76,0.25)" } : {}),
                }}
              >
                <span 
                  ref={el => lineRefs.current[i] = el}
                  className={`hero-typing-line hero-typing-line-${i + 1} inline-block`}
                >
                  {word}
                </span>
              </span>
            ))}
            {/* Single cursor */}
            <span 
              className="hero-single-cursor"
              style={cursorStyle}
            />
          </h1>

          <p className="font-body font-light text-[0.9rem] sm:text-[1rem] md:text-[1.1rem] text-white/75 max-w-[480px] leading-relaxed mb-6 sm:mb-8 animate-cursor-reveal" style={{ animationDelay: "2.1s" }}>
            Rooted in ancient tradition. Elevated for the modern soul. Join Javani Spiritual Hub and embark on a journey of grace, discipline, and self-discovery.
          </p>

          <div className="flex flex-wrap gap-3 sm:gap-4 mb-6 sm:mb-8 animate-cursor-reveal" style={{ animationDelay: "2.3s" }}>
            <Link to="/courses">
              <PrimaryButton>Explore Courses</PrimaryButton>
            </Link>
            <Link to="/products">
              <GoldOutlineButton variant="white" className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Our Products
              </GoldOutlineButton>
            </Link>
          </div>

          <div className="flex items-center gap-3 font-body font-medium text-[0.85rem] sm:text-[0.875rem] text-white animate-cursor-reveal" style={{ animationDelay: "2.5s", textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>
            <span>500+ Students</span>
            <span className="text-gold">✦</span>
            <span>15+ Courses</span>
            <span className="text-gold">✦</span>
            <span>12+ Years Legacy</span>
          </div>

          {/* Slide indicators */}
          <div className="flex items-center gap-2 mt-8 sm:mt-12 opacity-0 animate-fade-up" style={{ animationDelay: "2.9s" }}>
            {heroImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`h-1 rounded-full transition-all duration-500 ${
                  currentImage === i ? "w-10 bg-gold" : "w-3 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
