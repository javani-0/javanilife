import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import SectionLabel from "@/components/SectionLabel";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const refundPoints = [
  "Requests for refunds must be submitted to spiritualarts@javanilife.com with payment reference and reason for refund.",
  "Refund request is accepted only by initiating within 48hrs of fee payment done from your side.",
  "Refund eligibility depends on the fee type (tuition, exam, admission) and the date of request. Specific refund windows and deduction rules (if any) will be communicated at the time of payment or in the relevant fee policy document.",
  "Processing time for approved refunds is subject to BRAND timelines and typically 7–45 business days after approval, but may vary.",
  "Registration charges & admission are strictly non-refundable under any circumstances.",
];

const TermsAndConditions = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: contentRef, isVisible: contentVisible } = useScrollAnimation();

  return (
    <>
      <SEO
        title="Terms & Conditions | Javani Spiritual Hub"
        description="Terms and conditions, refund and cancellation policy for Javani Spiritual Hub programs and services."
      />
      <main>
        {/* Header */}
        <section className="bg-[#1A0A0A] pt-28 pb-12 sm:pt-32 sm:pb-16">
          <div ref={headerRef} className={`max-w-4xl mx-auto px-4 sm:px-6 text-center ${headerVisible ? "animate-fade-up" : "opacity-0"}`}>
            <SectionLabel text="LEGAL" className="mb-4" />
            <h1 className="font-display font-semibold text-[2rem] sm:text-[2.5rem] md:text-[3rem] text-white leading-tight mb-4">
              Terms &amp; Conditions
            </h1>
            <p className="font-body font-light text-[0.95rem] text-white/60 max-w-xl mx-auto">
              Please read these terms carefully before enrolling in any of our programs.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-10 sm:py-16 bg-background">
          <div ref={contentRef} className={`max-w-4xl mx-auto px-4 sm:px-6 ${contentVisible ? "animate-fade-up" : "opacity-0"}`}>

            {/* Refunds & Cancellation */}
            <div className="bg-card border border-gold/20 rounded-xl p-5 sm:p-8 shadow-card">
              <h2 className="font-display font-semibold text-[1.3rem] sm:text-[1.5rem] text-foreground mb-1 flex items-center gap-2">
                <span className="w-1 h-6 bg-gold rounded-full inline-block" />
                Terms &amp; Conditions Applied
              </h2>

              <h3 className="font-display font-semibold text-[0.95rem] sm:text-[1.1rem] text-foreground mt-6 mb-3">
                Refunds &amp; Cancellation Policy
              </h3>
              <p className="font-body font-light text-[0.85rem] sm:text-[0.9rem] text-muted-foreground mb-5 leading-relaxed">
                Refunds are processed according to the rules below:
              </p>
              <ul className="space-y-3 mb-6">
                {refundPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-accent font-bold">
                      {i + 1}
                    </span>
                    <span className="font-body font-light text-[0.85rem] sm:text-[0.95rem] text-foreground leading-relaxed">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-body text-[0.8rem] sm:text-[0.85rem] text-muted-foreground italic border-t border-gold/10 pt-4">
                Refer Terms &amp; Condition policy documents for more details
              </p>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default TermsAndConditions;
