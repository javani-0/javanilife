import { Link } from "react-router-dom";
import PrimaryButton from "@/components/PrimaryButton";
import GoldOutlineButton from "@/components/GoldOutlineButton";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center max-w-lg">
        <p className="font-display font-bold text-[8rem] leading-none text-primary/15 mb-4">404</p>
        {/* Lotus SVG */}
        <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto mb-6 text-gold">
          <path d="M40 10c0 16-12 24-12 32s12 16 12 24c0-8 12-16 12-24s-12-16-12-32z" fill="currentColor" opacity="0.8" />
          <path d="M40 10c-8 8-20 12-24 20s4 20 24 36c20-16 28-28 24-36s-16-12-24-20z" fill="currentColor" opacity="0.3" />
        </svg>
        <h1 className="font-display font-semibold text-[2rem] md:text-[2.5rem] text-primary mb-4">
          This Page Has Drifted Away
        </h1>
        <p className="font-body font-light text-[1rem] text-muted-foreground mb-8">
          The page you're looking for doesn't exist, but there's a lot of beauty still to explore.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/"><PrimaryButton>Return to Homepage</PrimaryButton></Link>
          <Link to="/courses"><GoldOutlineButton>Explore Our Courses</GoldOutlineButton></Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
