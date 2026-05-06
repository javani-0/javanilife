import { useEffect, useRef, useState } from "react";
import { useCountUp } from "@/hooks/useScrollAnimation";

interface StatCardProps {
  number: string;
  label: string;
}

const StatCard = ({ number, label }: StatCardProps) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Extract numeric part for count-up
  const numericMatch = number.match(/(\d+)/);
  const numericEnd = numericMatch ? parseInt(numericMatch[1]) : 0;
  const suffix = number.replace(/\d+/, "");
  const countValue = useCountUp(numericEnd, 1500, visible);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.92]"}`}>
      <p className="font-display font-bold text-[3rem] text-gold-light mb-2">
        {visible ? `${countValue}${suffix}` : number}
      </p>
      <p className="font-body font-medium text-white/80 text-sm tracking-wide">{label}</p>
      <div className="mt-3 mx-auto w-12 h-0.5 bg-gold/40" />
    </div>
  );
};

export default StatCard;
