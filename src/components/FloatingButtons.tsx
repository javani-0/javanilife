import { useState, useEffect } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import { useContactInfo } from "@/hooks/useContactInfo";

const SITE_SUFFIX = /\s*\|.*$/; // "Course | Online Course | Javani Spiritual Hub" -> "Course"

/** The chat message names the page the visitor is on and carries its link. */
export const whatsappEnquiryText = (pathname: string, pageTitle: string, origin: string) => {
  const greeting = "Hi Javani Spiritual Hub,";
  if (pathname === "/" || pathname === "") return `${greeting} I'd like to know more about your courses.`;
  const name = pageTitle.replace(SITE_SUFFIX, "").trim();
  const url = `${origin}${pathname}`;
  if (pathname.startsWith("/learn/") && name) return `${greeting} I'd like to know more about the course "${name}".
${url}`;
  return `${greeting} I'd like to know more${name ? ` about "${name}"` : ""}.
${url}`;
};

const FloatingButtons = () => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { whatsappNumber } = useContactInfo();

  useEffect(() => {
    const timer = setTimeout(() => setShowWhatsApp(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Back to Top */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed right-6 bottom-[104px] z-[999] w-11 h-11 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-lg hover:brightness-110 transition-all duration-300 ${
          showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        aria-label="Back to top"
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      {/* WhatsApp */}
      <div
        className={`fixed right-6 bottom-6 z-[999] transition-all duration-500 ${showWhatsApp ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Tooltip */}
        <div className={`absolute right-[72px] top-1/2 -translate-y-1/2 bg-card text-foreground font-body text-sm px-4 py-2 rounded-lg shadow-card whitespace-nowrap transition-all duration-200 ${showTooltip ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"}`}>
          Chat with us!
          <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-b-[6px] border-l-[6px] border-transparent border-l-card" />
        </div>

        <a
          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappEnquiryText("/", "", ""))}`}
          // Built at click time so it names the page the visitor is on now (the title is set after render).
          onClick={(event) => {
            event.currentTarget.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappEnquiryText(window.location.pathname, document.title, window.location.origin))}`;
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="w-[60px] h-[60px] rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:scale-110 hover:shadow-[0_8px_24px_rgba(37,211,102,0.4)] transition-all duration-300"
          aria-label="Chat on WhatsApp"
        >
          <MessageCircle className="w-7 h-7 text-white" />
        </a>
      </div>
    </>
  );
};

export default FloatingButtons;
