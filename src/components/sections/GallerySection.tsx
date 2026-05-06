import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionLabel from "../SectionLabel";
import GoldOutlineButton from "../GoldOutlineButton";
import { X, ZoomIn } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";
import dancerPortrait from "@/assets/dancer-portrait-1.jpg";
import dancerCloseup from "@/assets/dancer-closeup.jpg";
import danceDetail from "@/assets/dance-detail-feet.jpg";
import danceClass from "@/assets/dance-class.jpg";
import carnaticMusic from "@/assets/carnatic-music.jpg";
import templeGopuram from "@/assets/temple-gopuram.jpg";

const fallbackImages = [
  heroDancer1,
  heroDancer2,
  heroDancer3,
  dancerPortrait,
  dancerCloseup,
  danceDetail,
  danceClass,
  carnaticMusic,
  templeGopuram,
];

const GallerySection = () => {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<string[]>(fallbackImages);
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: imagesRef, isVisible: imagesVisible } = useScrollAnimation();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "gallery"), (snap) => {
      if (!snap.empty) {
        const fetchedImages = snap.docs.map((d) => d.data().url);
        if (fetchedImages.length > 0) {
          setImages(fetchedImages);
        }
      }
    }, () => {
      // silently fail - fallback images will be used
    });
    return () => unsub();
  }, []);

  const displayImages = images.slice(0, 9);

  return (
    <section className="py-16 sm:py-20 md:py-32 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef}>
          <div className={`${headerVisible ? "animate-scale-in" : "opacity-0"}`}>
            <SectionLabel text="MOMENTS OF ART" className="mb-6" />
          </div>
          <div className={`${headerVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: headerVisible ? "0.1s" : undefined }}>
            <h2 className="font-display font-semibold text-[1.8rem] sm:text-[2rem] md:text-[3rem] text-foreground text-center mb-10 sm:mb-12">
              Every Performance, A Prayer
            </h2>
          </div>
        </div>

        <div ref={imagesRef} className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4 mb-10 sm:mb-12">
          {displayImages.map((src, i) => (
            <div
              key={i}
              className={`relative group cursor-pointer overflow-hidden rounded-lg break-inside-avoid ${imagesVisible ? "animate-scale-in" : "opacity-0"}`}
              style={{ animationDelay: imagesVisible ? `${i * 0.08}s` : undefined }}
              onClick={() => setLightbox(src)}
            >
              {!loaded.has(i) && <div className="aspect-[4/3] skeleton-shimmer" />}
              <img
                src={src}
                alt={`Gallery image ${i + 1}`}
                onLoad={() => setLoaded((p) => new Set(p).add(i))}
                className={`w-full object-cover transition-all duration-500 group-hover:scale-[1.04] ${loaded.has(i) ? "opacity-100" : "opacity-0 absolute inset-0"}`}
              />
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/40 transition-all duration-300 flex items-center justify-center">
                <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-8 h-8" />
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/gallery"><GoldOutlineButton>View Full Gallery →</GoldOutlineButton></Link>
        </div>
      </div>

      {lightbox && createPortal(
        <div className="fixed inset-0 z-[10001] bg-charcoal/90 flex items-center justify-center p-4 sm:p-6 animate-fade-in cursor-pointer" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white" onClick={() => setLightbox(null)}>
            <X className="w-8 h-8" />
          </button>
          <img src={lightbox} alt="Full gallery view" className="max-w-full max-h-[85vh] object-contain rounded" />
        </div>,
        document.body
      )}
    </section>
  );
};

export default GallerySection;
