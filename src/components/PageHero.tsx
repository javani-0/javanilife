import { useState, useEffect, useCallback } from "react";
import SectionLabel from "@/components/SectionLabel";

interface PageHeroProps {
  backgroundImages: string[];
  label: string;
  heading: string;
  subtext?: string;
  breadcrumb?: { label: string; path?: string }[];
  interval?: number;
  size?: "default" | "compact";
}

const PageHero = ({ backgroundImages = [], label, heading, subtext, breadcrumb, interval = 5000, size = "default" }: PageHeroProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const isCompact = size === "compact";

  const nextSlide = useCallback(() => {
    if (backgroundImages.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % backgroundImages.length);
  }, [backgroundImages.length]);

  useEffect(() => {
    if (backgroundImages.length <= 1) return;
    const timer = setInterval(nextSlide, interval);
    return () => clearInterval(timer);
  }, [nextSlide, interval, backgroundImages.length]);

  return (
    <section className={`relative flex items-center justify-center overflow-hidden ${isCompact ? "h-[36vh] min-h-[240px] sm:h-[40vh] sm:min-h-[280px] md:h-[48vh] md:min-h-[340px] lg:h-[56vh] lg:min-h-[400px]" : "h-[50vh] min-h-[320px] md:h-[60vh] md:min-h-[420px] lg:h-[70vh] lg:min-h-[480px]"}`}>
      {/* Sliding background images */}
      {backgroundImages.map((img, i) => (
        <div
          key={i}
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${img})`,
            opacity: currentIndex === i && loadedImages.has(i) ? 1 : 0,
            transform: currentIndex === i ? "scale(1.05)" : "scale(1)",
            transition: "opacity 1s ease-in-out, transform 6s ease-out",
          }}
        />
      ))}

      {/* Preload images */}
      {backgroundImages.map((img, i) => (
        <img
          key={`preload-${i}`}
          src={img}
          alt=""
          className="hidden"
          onLoad={() => setLoadedImages((prev) => new Set(prev).add(i))}
        />
      ))}

      {/* Shimmer while loading */}
      {!loadedImages.has(0) && <div className="absolute inset-0 skeleton-shimmer" />}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-[#1A0A0A]/65" />

      {/* Bottom wave divider */}
      <div className="absolute bottom-0 left-0 right-0 z-[5]">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0 80L0 40C360 10 720 0 1080 20C1260 30 1380 50 1440 40L1440 80L0 80Z" fill="hsl(var(--background))" />
          <path d="M0 40C360 10 720 0 1080 20C1260 30 1380 50 1440 40" stroke="hsl(var(--gold) / 0.25)" strokeWidth="1" fill="none" />
        </svg>
      </div>

      {/* Content */}
      <div className={`relative z-10 text-center max-w-3xl mx-auto px-4 sm:px-6 ${isCompact ? "pt-12 sm:pt-14" : "pt-16 sm:pt-20"}`}>
        <SectionLabel text={label} className={`[&_span]:text-gold-light [&_div]:bg-gold-light ${isCompact ? "mb-3 sm:mb-4" : "mb-4 sm:mb-6"}`} />
        <h1 className={`font-display font-bold text-white leading-tight ${isCompact ? "text-[1.55rem] sm:text-[2.1rem] md:text-[2.9rem] lg:text-[3.8rem] mb-2.5 sm:mb-3" : "text-[1.8rem] sm:text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] mb-3 sm:mb-4"}`}>
          {heading}
        </h1>
        {subtext && (
          <p className={`font-body font-light text-white/80 max-w-lg mx-auto ${isCompact ? "text-[0.84rem] sm:text-[0.95rem] md:text-[1.02rem]" : "text-[0.9rem] sm:text-[1rem] md:text-[1.1rem]"}`}>
            {subtext}
          </p>
        )}
        {breadcrumb && (
          <p className={`font-body font-light text-white/60 ${isCompact ? "text-[0.75rem] sm:text-[0.82rem] mt-2.5 sm:mt-3" : "text-[0.8rem] sm:text-[0.875rem] mt-3 sm:mt-4"}`}>
            {breadcrumb.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2">›</span>}
                {b.label}
              </span>
            ))}
          </p>
        )}

        {/* Slide indicators */}
        {backgroundImages.length > 1 && (
          <div className={`flex items-center justify-center gap-2 ${isCompact ? "mt-4 sm:mt-5" : "mt-6 sm:mt-8"}`}>
            {backgroundImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-1 rounded-full transition-all duration-500 ${
                  currentIndex === i ? "w-8 bg-gold" : "w-2 bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default PageHero;
