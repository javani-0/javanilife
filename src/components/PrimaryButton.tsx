import { ButtonHTMLAttributes } from "react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  compact?: boolean;
}

const PrimaryButton = ({ children, compact, className = "", ...props }: PrimaryButtonProps) => (
  <button
    className={`relative overflow-hidden bg-gradient-primary text-primary-foreground font-display font-medium text-[1.1rem] tracking-[0.08em] border-none cursor-pointer transition-all duration-300 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,26,26,0.35)] active:translate-y-0 group ${
      compact ? "px-6 py-2.5" : "px-9 py-3.5"
    } ${className}`}
    style={{ borderRadius: "2px" }}
    {...props}
  >
    {children}
    {/* Shimmer sweep on hover */}
    <span className="absolute inset-0 w-[30%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[btn-shimmer_0.5s_ease-in-out] pointer-events-none" />
  </button>
);

export default PrimaryButton;
