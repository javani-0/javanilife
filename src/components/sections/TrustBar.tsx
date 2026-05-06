const items = [
  "500+ Students Trained",
  "Nationally Certified Courses",
  "12+ Years of Excellence",
  "Performing Arts Diploma Programs",
  "University-Linked Certifications",
  "Beginner to Advanced Levels",
  "Flexible Batch Timings",
];

const TrustBar = () => (
  <section className="bg-gradient-primary py-3 overflow-hidden">
    <div className="animate-marquee flex whitespace-nowrap">
      {[...items, ...items].map((item, i) => (
        <span key={i} className="font-display font-medium text-[1rem] text-white tracking-wide mx-6 inline-flex items-center gap-6">
          <span className="text-gold-light">✦</span>
          {item}
        </span>
      ))}
    </div>
  </section>
);

export default TrustBar;
