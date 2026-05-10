import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

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

  const shouldAnimate = partners.length >= 2;
  const halfPoint = Math.ceil(partners.length / 2);
  const firstRowPartners = partners.slice(0, Math.min(halfPoint, 8));
  const secondRowPartners = partners.slice(Math.min(halfPoint, 8));
  const showSecondRow = secondRowPartners.length > 0;
  const shouldAnimateSecondRow = secondRowPartners.length >= 2;
  const firstRow = shouldAnimate ? [...firstRowPartners, ...firstRowPartners, ...firstRowPartners] : partners;
  const secondRow = shouldAnimateSecondRow ? [...secondRowPartners, ...secondRowPartners, ...secondRowPartners] : secondRowPartners;

  return (
    <section className="py-12 sm:py-16 md:py-20 bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-14">
            <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-r from-transparent to-gold" />
            <span className="font-accent text-[0.85rem] sm:text-[0.95rem] tracking-[0.25em] uppercase text-gold">OUR PARTNERS</span>
            <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-l from-transparent to-gold" />
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
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            {partners.map((partner) => (
              <div key={partner.id} className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-8 py-6 min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300">
                <img src={partner.logoUrl} alt={partner.name} className="h-12 w-auto object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="block md:hidden">
              <div className="grid grid-cols-2 gap-3">
                {partners.map((partner) => (
                  <div key={partner.id} className="flex items-center justify-center bg-card border border-gold/10 rounded-lg px-3 py-4 shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300">
                    <img src={partner.logoUrl} alt={partner.name} className="h-8 w-auto object-contain" />
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative mb-8 overflow-hidden">
                <div className="flex gap-6 md:gap-8 animate-scroll-right whitespace-nowrap">
                  {firstRow.map((partner, index) => (
                    <div key={`${partner.id}-${index}`} className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-6 py-5 md:px-8 md:py-6 min-w-[180px] md:min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300">
                      <img src={partner.logoUrl} alt={partner.name} className="h-11 md:h-12 w-auto object-contain" />
                    </div>
                  ))}
                </div>
              </div>

              {showSecondRow && (
                shouldAnimateSecondRow ? (
                  <div className="relative overflow-hidden">
                    <div className="flex gap-6 md:gap-8 animate-scroll-left whitespace-nowrap">
                      {secondRow.map((partner, index) => (
                        <div key={`${partner.id}-${index}`} className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-6 py-5 md:px-8 md:py-6 min-w-[180px] md:min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300">
                          <img src={partner.logoUrl} alt={partner.name} className="h-11 md:h-12 w-auto object-contain" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
                    {secondRowPartners.map((partner) => (
                      <div key={partner.id} className="inline-flex items-center justify-center bg-card border border-gold/10 rounded-lg px-8 py-6 min-w-[200px] shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300">
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
          0% { transform: translateX(-33.333%); }
          100% { transform: translateX(0%); }
        }

        @keyframes scroll-left {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.333%); }
        }

        .animate-scroll-right { animation: scroll-right 12s linear infinite; }
        .animate-scroll-left { animation: scroll-left 12s linear infinite; }

        @media (min-width: 1024px) {
          .animate-scroll-right { animation: scroll-right 18s linear infinite; }
          .animate-scroll-left { animation: scroll-left 18s linear infinite; }
        }

        .animate-scroll-right:hover,
        .animate-scroll-left:hover { animation-play-state: paused; }
      `}</style>
    </section>
  );
};

export default PartnersSection;
