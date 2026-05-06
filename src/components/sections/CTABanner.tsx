import { Link } from "react-router-dom";
import SectionLabel from "../SectionLabel";
import PrimaryButton from "../PrimaryButton";
import GoldOutlineButton from "../GoldOutlineButton";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useContactInfo } from "@/hooks/useContactInfo";
import danceClass from "@/assets/dance-class.jpg";

const CTABanner = () => {
  const { ref, isVisible } = useScrollAnimation();
  const { whatsappNumber } = useContactInfo();

  return (
    <section className="relative py-16 sm:py-20 md:py-32 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${danceClass})` }}
      />
      <div className="absolute inset-0 bg-[#1A0A0A]/90" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-gold/60 via-gold to-gold/60" />

      <div ref={ref} className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`}>
          <SectionLabel text="BEGIN YOUR JOURNEY" className="mb-6 [&_span]:text-gold-light [&_div]:bg-gold-light" />
        </div>
        <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.1s" : undefined }}>
          <h2 className="font-display font-bold text-[1.8rem] sm:text-[2rem] md:text-[3.5rem] text-white mb-4 sm:mb-6 leading-tight">
            Ready to Discover Your Sacred Art?
          </h2>
        </div>
        <div className={`${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.2s" : undefined }}>
          <p className="font-body font-light text-[0.95rem] sm:text-[1rem] md:text-[1.1rem] text-white/80 mb-6 sm:mb-8 max-w-lg mx-auto">
            Enquire today and our team will guide you to the perfect course for your age, experience, and artistic goals.
          </p>
        </div>
        <div className={`flex flex-wrap justify-center gap-3 sm:gap-4 mb-6 sm:mb-8 ${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.3s" : undefined }}>
          <Link to="/contact"><PrimaryButton>Enquire Now</PrimaryButton></Link>
          <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer"><GoldOutlineButton variant="white">WhatsApp Us</GoldOutlineButton></a>
        </div>
        <div className={`flex items-center justify-center gap-3 font-body font-light text-[0.8rem] sm:text-[0.875rem] text-white/60 flex-wrap ${isVisible ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: isVisible ? "0.4s" : undefined }}>
          <span className="text-gold-light">✦</span>
          <span>Free initial counselling session</span>
          <span className="text-gold-light">✦</span>
          <span>Flexible batch timings</span>
          <span className="text-gold-light">✦</span>
          <span>Students of all ages welcome</span>
        </div>
      </div>
    </section>
  );
};

export default CTABanner;
