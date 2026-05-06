
import Footer from "@/components/Footer";
import HeroSection from "@/components/sections/HeroSection";
import TrustBar from "@/components/sections/TrustBar";
import AboutSection from "@/components/sections/AboutSection";
import CoursesPreview from "@/components/sections/CoursesPreview";
import StatsSection from "@/components/sections/StatsSection";
import GallerySection from "@/components/sections/GallerySection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import CTABanner from "@/components/sections/CTABanner";
import SEO from "@/components/SEO";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Javani Spiritual Hub",
  "description": "Classical dance and music academy in Secunderabad",
  "url": "https://www.Javaniarts.com",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Secunderabad",
    "addressRegion": "Telangana",
    "postalCode": "500062",
    "addressCountry": "IN",
  },
  "offers": [
    { "@type": "Course", "name": "Bharatanatyam" },
    { "@type": "Course", "name": "Kuchipudi" },
    { "@type": "Course", "name": "Carnatic Music" },
  ],
};

const Index = () => (
  <>
    <SEO
      title="Javani Spiritual Hub | Classical Dance & Music Academy in Secunderabad"
      description="Join Javani Spiritual Hub — a premier classical dance and music academy in Secunderabad, Telangana. Certified courses in Bharatanatyam, Kuchipudi, Carnatic Music, and more."
      canonical="https://www.Javaniarts.com/"
      ogImage="https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1200"
      jsonLd={jsonLd}
    />
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

export default Index;
