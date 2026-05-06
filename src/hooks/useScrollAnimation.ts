import { useEffect, useRef, useState } from "react";

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
}

export const useScrollAnimation = (options: UseScrollAnimationOptions = {}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only trigger animation when scrolling into view, not if already in view on page load
        if (entry.isIntersecting && !hasAnimated.current) {
          // Force a small delay to ensure the opacity-0 state is painted first
          requestAnimationFrame(() => {
            setIsVisible(true);
            hasAnimated.current = true;
          });
          observer.unobserve(el);
        }
      },
      { threshold: options.threshold ?? 0.1, rootMargin: options.rootMargin ?? "0px" }
    );

    // Small delay to ensure page has loaded before observing
    const timeout = setTimeout(() => {
      observer.observe(el);
    }, 150);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [options.threshold, options.rootMargin]);

  return { ref, isVisible };
};

export const useCountUp = (end: number, duration: number = 1500, start: boolean = false) => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOut
      setValue(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, end, duration]);

  return value;
};
