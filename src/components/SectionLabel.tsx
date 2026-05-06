const SectionLabel = ({ text, className = "" }: { text: string; className?: string }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`}>
    <div className="h-px w-8 bg-gold" />
    <span className="font-accent text-[0.7rem] tracking-[0.25em] uppercase text-gold">
      {text}
    </span>
    <div className="h-px w-8 bg-gold" />
  </div>
);

export default SectionLabel;
