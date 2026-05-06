import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";

const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  // Track whether we're in an admin→admin transition
  const prevPathRef = useRef(location.pathname);
  const [displayed, setDisplayed] = useState(children);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const prev = prevPathRef.current;
    const next = location.pathname;
    prevPathRef.current = next;

    // Admin→admin: AdminLayout handles its own fade, nothing to do here
    if (prev.startsWith("/admin") && next.startsWith("/admin")) {
      setDisplayed(children);
      return;
    }

    // Cross-fade: show new content on top fading in while old content stays below
    setDisplayed(children);
    setFading(true);
    const t = setTimeout(() => setFading(false), 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Sync children when not transitioning (e.g. first render, data updates)
  useEffect(() => {
    if (!fading) setDisplayed(children);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  return (
    <div
      style={{
        opacity: fading ? 0 : 1,
        transition: fading ? "none" : "opacity 250ms ease",
      }}
    >
      {displayed}
    </div>
  );
};

export default PageTransition;
