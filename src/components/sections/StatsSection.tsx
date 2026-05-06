import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatCard from "../StatCard";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const defaultStats = [
  { number: "500+", label: "Students Trained" },
  { number: "15+", label: "Courses Offered" },
  { number: "12+", label: "Years of Excellence" },
  { number: "100%", label: "Certified Faculty" },
];

const StatsSection = () => {
  const [stats, setStats] = useState(defaultStats);
  const { ref, isVisible } = useScrollAnimation();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const snap = await getDoc(doc(db, "siteSettings", "stats"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.items && data.items.length > 0) {
            setStats(data.items);
          }
        } else {
          // Seed defaults
          await setDoc(doc(db, "siteSettings", "stats"), { items: defaultStats });
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };
    fetchStats();
  }, []);

  return (
    <section className="py-20 md:py-32 bg-gradient-dark relative overflow-hidden">
      {/* Kolam pattern overlay */}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 0L100 50L50 100L0 50Z' fill='none' stroke='white' stroke-width='0.5'/%3E%3Ccircle cx='50' cy='50' r='20' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: "100px 100px",
      }} />
      <div ref={ref} className="max-w-5xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-12">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`${isVisible ? "animate-scale-in" : "opacity-0"}`}
            style={{ animationDelay: isVisible ? `${i * 0.15}s` : undefined }}
          >
            <StatCard {...s} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatsSection;
