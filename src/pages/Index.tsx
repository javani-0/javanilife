
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import TrustBar from "@/components/sections/TrustBar";
import AboutSection from "@/components/sections/AboutSection";
import CoursesPreview from "@/components/sections/CoursesPreview";
import StatsSection from "@/components/sections/StatsSection";
import GallerySection from "@/components/sections/GallerySection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import CTABanner from "@/components/sections/CTABanner";
import { PageSEO } from "@/components/SEO";
import { useContactInfo } from "@/hooks/useContactInfo";

const Index = () => {
  const contactInfo = useContactInfo();
  return (
  <>
    <PageSEO path="/" contact={contactInfo} />
    <main>
      <HeroSection />
      <TrustBar />
      <AboutSection />
      <CoursesPreview />
      <StatsSection />
      <GallerySection />
      <TestimonialsSection />
      <CTABanner />
    </main>
    <Footer />
  </>
  );
};

export default Index;
