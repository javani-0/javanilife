import { ButtonHTMLAttributes } from "react";

interface GoldOutlineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "white";
}

const GoldOutlineButton = ({ children, variant = "default", className = "", ...props }: GoldOutlineButtonProps) => (
  <button
    className={`font-display font-medium text-[1.1rem] tracking-[0.08em] px-9 py-3.5 cursor-pointer transition-all duration-300 bg-transparent ${
      variant === "white"
        ? "border-[1.5px] border-white/60 text-white hover:bg-white/10"
        : "border-[1.5px] border-gold text-gold hover:bg-gold hover:text-white"
    } ${className}`}
    style={{ borderRadius: "2px" }}
    {...props}
  >
    {children}
  </button>
);

export default GoldOutlineButton;
