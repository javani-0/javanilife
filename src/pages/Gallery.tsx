import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroDancer2 from "@/assets/hero-dancer-2.jpg";
import heroDancer3 from "@/assets/hero-dancer-3.jpg";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import { ZoomIn, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const galleryHeroBgs = [heroDancer1, heroDancer2, heroDancer3];

type GalleryCategory = "all" | "performances" | "workshops" | "certifications" | "behind" | "recitals";
interface GalleryImage { src: string; category: GalleryCategory[]; }

const categoryMap: Record<string, GalleryCategory> = {
  "Performances": "performances", "Workshops": "workshops", "Certifications": "certifications",
  "Behind the Scenes": "behind", "Recitals": "recitals",
};

const filters: { label: string; value: GalleryCategory }[] = [
  { label: "All", value: "all" }, { label: "Performances", value: "performances" },
  { label: "Workshops", value: "workshops" }, { label: "Certifications", value: "certifications" },
  { label: "Behind the Scenes", value: "behind" }, { label: "Recitals", value: "recitals" },
];

const Gallery = () => {
  const [activeFilter, setActiveFilter] = useState<GalleryCategory>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const { ref: filterRef, isVisible: filterVisible } = useScrollAnimation();

  useEffect(() => {
    // Safety timeout — never stay in loading state forever
    const timeout = setTimeout(() => setLoading(false), 3000);
    const unsub = onSnapshot(collection(db, "gallery"), (snap) => {
      clearTimeout(timeout);
      const fetched = snap.docs
        .map((d) => {
          const data = d.data();
          if (!data.url) return null;
          const cat = categoryMap[data.category] || "performances";
          return { src: data.url, category: [cat] as GalleryCategory[] };
        })
        .filter(Boolean) as GalleryImage[];
      setImages(fetched);
      setLoading(false);
    }, (err) => {
      clearTimeout(timeout);
      console.error("Error fetching gallery:", err);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const filtered = activeFilter === "all" ? images : images.filter((img) => img.category.includes(activeFilter));

  const closeLightbox = () => setLightboxIndex(null);
  const prev = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex <= 0 ? filtered.length - 1 : lightboxIndex - 1);
  }, [lightboxIndex, filtered.length]);
  const next = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex >= filtered.length - 1 ? 0 : lightboxIndex + 1);
  }, [lightboxIndex, filtered.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, prev, next]);

  return (
    <>
      <SEO
        title="Gallery | Performances & Student Moments | Javani Spiritual Hub"
        description="Browse photos from performances, workshops, certifications, and behind-the-scenes moments at Javani Spiritual Hub."
      />
      <main>
        <PageHero backgroundImages={galleryHeroBgs} label="OUR GALLERY" heading="Gallery of Art & Expression" subtext="Every photograph tells the story of a student's devotion." />

        <div ref={filterRef} className={`sticky top-[80px] z-[500] bg-card shadow-sm py-3 sm:py-4 ${filterVisible ? "animate-fade-down" : "opacity-0"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center gap-2">
            {filters.map((f) => (
              <button key={f.value} onClick={() => { setActiveFilter(f.value); setLoaded(new Set()); }} className={`px-4 sm:px-5 py-2 rounded-full font-body font-medium text-[0.8rem] sm:text-[0.875rem] transition-all duration-300 ${activeFilter === f.value ? "bg-gradient-primary text-primary-foreground" : "border border-ivory-dark text-muted-foreground hover:bg-ivory-dark"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <section className="py-12 sm:py-16 md:py-24 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            {loading ? (
              <div className="text-center py-16">
                <div className="w-10 h-10 border-4 border-gold/30 border-t-gold rounded-full animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="font-body text-muted-foreground">No images available in this category.</p>
              </div>
            ) : (
              <div className="columns-2 lg:columns-3 2xl:columns-4 gap-3 sm:gap-4 space-y-3 sm:space-y-4">
                {filtered.map((img, i) => (
                  <div
                    key={i + activeFilter}
                    className="relative group cursor-pointer overflow-hidden rounded-lg break-inside-avoid animate-scale-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => setLightboxIndex(i)}
                  >
                    {!loaded.has(i) && <div className="aspect-[4/3] skeleton-shimmer" />}
                    <img
                      src={img.src}
                      alt={`Gallery image ${i + 1}`}
                      onLoad={() => setLoaded((p) => new Set(p).add(i))}
                      onError={() => setLoaded((p) => new Set(p).add(i))}
                      className={`w-full object-cover transition-all duration-500 group-hover:scale-[1.04] ${loaded.has(i) ? "opacity-100" : "opacity-0 absolute inset-0"}`}
                    />
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/50 transition-all duration-300 flex items-center justify-center">
                      <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />

      {lightboxIndex !== null && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black/95 flex items-center justify-center animate-fade-in" onClick={closeLightbox}>
          <button className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors z-10" onClick={(e) => { e.stopPropagation(); closeLightbox(); }}><X className="w-6 h-6" /></button>
          <button className="absolute left-2 sm:left-4 md:left-8 top-1/2 -translate-y-1/2 w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors z-10" onClick={(e) => { e.stopPropagation(); prev(); }}><ChevronLeft className="w-6 h-6" /></button>
          <button className="absolute right-2 sm:right-4 md:right-8 top-1/2 -translate-y-1/2 w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors z-10" onClick={(e) => { e.stopPropagation(); next(); }}><ChevronRight className="w-6 h-6" /></button>
          <img src={filtered[lightboxIndex].src} alt={`Gallery ${lightboxIndex + 1}`} className="max-h-[90vh] max-w-[90vw] object-contain rounded" onClick={(e) => e.stopPropagation()} />
          <p className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 font-body font-light text-[0.8rem] sm:text-[0.875rem] text-white/60">Image {lightboxIndex + 1} of {filtered.length}</p>
        </div>,
        document.body
      )}
    </>
  );
};

export default Gallery;
