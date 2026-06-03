import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Deep-link helper for WhatsApp / shared notification buttons.
 *
 * When the URL carries `?<param>=<value>` (e.g. `/account/classes?fee=abc_2026-07`),
 * this finds the DOM element with id `<param>-<value>`, scrolls it into view and
 * briefly highlights it with a gold ring. Pass `ready` (e.g. `!loading`) so it
 * runs only once the target has rendered.
 */
export const useScrollHighlight = (param: string, ready: boolean) => {
  const [searchParams] = useSearchParams();
  const value = searchParams.get(param);

  useEffect(() => {
    if (!value || !ready) return;
    // Literal class strings so Tailwind's content scanner keeps them in the build.
    const highlightClasses = ["ring-2", "ring-gold", "ring-offset-2", "rounded-lg"];

    // Wait a tick so the list has painted before scrolling.
    const scrollTimer = setTimeout(() => {
      const node = document.getElementById(`${param}-${value}`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add(...highlightClasses);
    }, 250);

    const clearTimer = setTimeout(() => {
      document.getElementById(`${param}-${value}`)?.classList.remove(...highlightClasses);
    }, 3600);

    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [value, ready, param]);
};
