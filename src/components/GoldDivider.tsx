const GoldDivider = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-4 py-4 ${className}`}>
    <div className="h-px flex-1 max-w-[120px] bg-gradient-to-r from-transparent to-gold" />
    <svg width="20" height="20" viewBox="0 0 20 20" className="text-gold flex-shrink-0">
      <path
        d="M10 0L12.5 7.5L20 10L12.5 12.5L10 20L7.5 12.5L0 10L7.5 7.5L10 0Z"
        fill="currentColor"
      />
    </svg>
    <div className="h-px flex-1 max-w-[120px] bg-gradient-to-l from-transparent to-gold" />
  </div>
);

export default GoldDivider;
