import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import GoldDivider from "@/components/GoldDivider";
import heroTemple from "@/assets/hero-temple.jpg";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import carnaticMusic from "@/assets/carnatic-music.jpg";
import logoBrown from "@/assets/logo-brown.png";
import logoWhite from "@/assets/logo-white.png";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  form: ReactNode;
  footer: ReactNode;
  supportTitle: string;
  supportCopy: string;
  highlights: string[];
}

const AuthShell = ({
  eyebrow,
  title,
  subtitle,
  form,
  footer,
  supportTitle,
  supportCopy,
  highlights,
}: AuthShellProps) => {
  return (
    <div className="relative min-h-[100dvh] w-full bg-[#170c08] text-white">
      {/* Background decoration — clipped independently so content never gets cut */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(139,26,26,0.3),transparent_32%),linear-gradient(135deg,#160a08_0%,#24110d_42%,#140909_100%)]" />
        <div className="absolute left-[-10%] top-[12%] h-72 w-72 rounded-full bg-[#d1ab58]/10 blur-3xl" />
        <div className="absolute bottom-[-8%] right-[-5%] h-80 w-80 rounded-full bg-[#7a1010]/25 blur-3xl" />
      </div>

      {/* ── MOBILE layout: full viewport composition, compact spacing ── */}
      <div className="auth-mobile-shell relative flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[linear-gradient(175deg,#fdf8ee,#f6ead9)] px-5 py-5 text-foreground max-[height:740px]:px-4 max-[height:740px]:py-4 max-[height:560px]:px-3 max-[height:560px]:py-3 sm:px-6 sm:py-6 lg:hidden">
        {/* Subtle warm glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_0%,rgba(201,168,76,0.13),transparent_60%)]" />

        <div className="auth-mobile-box relative w-full origin-center transform-gpu sm:max-w-[27rem] sm:max-[height:740px]:max-w-[24rem]">
          {/* Logo */}
          <div className="flex justify-center">
            <img src={logoBrown} alt="Javani Spiritual Hub" className="h-8 w-auto object-contain max-[height:740px]:h-7 max-[height:560px]:h-6 sm:h-9" />
          </div>

          {/* Eyebrow + divider + title */}
          <div className="mt-4 text-center max-[height:740px]:mt-3 max-[height:560px]:mt-2 sm:mt-5">
            <p className="font-body text-[0.62rem] font-semibold tracking-[0.28em] text-gold max-[height:740px]:text-[0.58rem] max-[height:740px]:tracking-[0.24em] max-[height:560px]:text-[0.53rem] max-[height:560px]:tracking-[0.2em] sm:text-[0.65rem] sm:tracking-[0.32em]">{eyebrow}</p>
            <GoldDivider className="py-1.5 max-[height:740px]:py-1 max-[height:560px]:py-0.5 sm:py-2" />
            <h2 className="font-display text-[1.72rem] leading-[1.02] text-foreground max-[height:740px]:text-[1.48rem] max-[height:560px]:text-[1.3rem] sm:text-[2rem]">{title}</h2>
            <p className="mt-1 font-body text-[0.84rem] leading-[1.45] text-muted-foreground max-[height:740px]:text-[0.77rem] max-[height:740px]:leading-[1.35] max-[height:560px]:text-[0.7rem] max-[height:560px]:leading-[1.2] sm:mt-1.5 sm:text-[0.86rem] sm:leading-[1.55]">{subtitle}</p>
          </div>

          {/* Form */}
          <div className="mt-4 max-[height:740px]:mt-3 max-[height:560px]:mt-2 sm:mt-5">{form}</div>

          {/* Footer */}
          <div className="mt-3 border-t border-gold/15 pt-3 max-[height:740px]:mt-2 max-[height:740px]:pt-2 max-[height:560px]:mt-1.5 max-[height:560px]:pt-1.5 sm:mt-4 sm:pt-4">{footer}</div>
        </div>
      </div>

      {/* ── DESKTOP layout: split-screen sized to one viewport ── */}
      <div className="relative hidden min-h-[100dvh] lg:grid lg:grid-cols-[minmax(0,1fr)_470px] xl:grid-cols-[minmax(0,1fr)_520px]">

        {/* ── Left: dark branded half — fills full height ── */}
        <section className="relative flex flex-col px-8 py-7 max-[height:760px]:px-7 max-[height:760px]:py-5 xl:px-12 xl:py-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <img src={logoWhite} alt="Javani Spiritual Hub" className="h-7 w-auto object-contain max-[height:760px]:h-6 xl:h-8" />
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d1ab58]/30 bg-[#d1ab58]/12 px-3 py-1.5 font-body text-[0.58rem] font-semibold tracking-[0.18em] text-[#f0d89c] max-[height:760px]:px-2.5 max-[height:760px]:py-1 max-[height:760px]:text-[0.54rem] xl:text-[0.62rem] xl:tracking-[0.2em]">
                <Sparkles className="h-2.5 w-2.5" /> PREMIUM
              </span>
              <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 font-body text-[0.58rem] font-semibold tracking-[0.16em] text-white/70 transition-colors hover:bg-white/12 max-[height:760px]:px-2.5 max-[height:760px]:py-1 max-[height:760px]:text-[0.54rem] xl:text-[0.62rem] xl:tracking-[0.18em]">
                <ArrowLeft className="h-3 w-3" /> HOME
              </Link>
            </div>
          </div>

          {/* Copy */}
          <div className="mt-8 max-[height:760px]:mt-5 xl:mt-10">
            <p className="font-body text-[0.58rem] font-semibold tracking-[0.28em] text-[#d1ab58] max-[height:760px]:text-[0.54rem] max-[height:760px]:tracking-[0.24em] xl:text-[0.63rem] xl:tracking-[0.32em]">{eyebrow}</p>
            <h1 className="mt-2.5 max-w-[13ch] font-display text-[2.05rem] leading-[0.94] text-white max-[height:760px]:mt-2 max-[height:760px]:max-w-[14ch] max-[height:760px]:text-[1.7rem] xl:mt-3 xl:text-[2.6rem]">{supportTitle}</h1>
            <p className="mt-3 max-w-[31rem] font-body text-[0.84rem] leading-[1.55] text-white/60 max-[height:760px]:mt-2.5 max-[height:760px]:max-w-[28rem] max-[height:760px]:text-[0.76rem] max-[height:760px]:leading-[1.4] xl:mt-4 xl:max-w-md xl:text-[0.91rem] xl:leading-[1.7]">{supportCopy}</p>
          </div>

          {/* Highlights */}
          <div className="mt-6 flex flex-col gap-2 max-[height:760px]:mt-4 max-[height:760px]:gap-1.5 xl:mt-8">
            {highlights.map((highlight) => (
              <div key={highlight} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 max-[height:760px]:gap-2.5 max-[height:760px]:px-3 max-[height:760px]:py-2 xl:py-3">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#d1ab58]" />
                <p className="font-body text-[0.8rem] leading-[1.45] text-white/72 max-[height:760px]:text-[0.73rem] max-[height:760px]:leading-[1.3] xl:text-[0.86rem] xl:leading-[1.55]">{highlight}</p>
              </div>
            ))}
          </div>

          {/* Image collage — pinned to bottom */}
          <div className="mt-auto grid grid-cols-[1.15fr_0.85fr] gap-3 pt-6 max-[height:760px]:hidden xl:gap-4 xl:pt-8">
            <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10">
              <img src={heroTemple} alt="Javani temple" className="h-full min-h-[138px] w-full object-cover opacity-85 max-[height:760px]:min-h-[112px] xl:min-h-[176px]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3 max-[height:760px]:p-2.5 xl:p-4">
                <p className="font-display text-[1.15rem] leading-tight text-white max-[height:760px]:text-[0.98rem] xl:text-[1.35rem]">Classical roots. Modern clarity.</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-[1.05rem] border border-white/10 xl:rounded-[1.2rem]">
                <img src={heroDancer1} alt="Javani dancer" className="h-20 w-full object-cover max-[height:760px]:h-16 xl:h-24" />
              </div>
              <div className="flex flex-1 flex-col overflow-hidden rounded-[1.05rem] border border-white/10 bg-white/[0.04] p-3 xl:rounded-[1.2rem] xl:p-3.5">
                <img src={carnaticMusic} alt="Javani music" className="h-11 w-full rounded-lg object-cover max-[height:760px]:h-9 xl:h-12" />
                <p className="mt-2 font-display text-[0.92rem] leading-[1.25] text-white max-[height:760px]:text-[0.8rem] xl:mt-2.5 xl:text-[1rem] xl:leading-[1.35]">Elevated access for courses &amp; orders.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Right: cream half — fills full height, form centred inside ── */}
        <section className="relative flex flex-col items-center justify-center border-l border-[#c9a84c]/18 bg-[linear-gradient(175deg,#fdf8ee,#f6ead9)] px-7 py-5 max-[height:760px]:justify-start max-[height:760px]:px-6 max-[height:760px]:py-4 xl:px-10 xl:py-6">
          {/* Subtle warm radial glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_0%,rgba(201,168,76,0.13),transparent_60%)]" />

          <div className="relative w-full max-w-[27rem] max-[height:760px]:max-w-[24rem] max-[height:760px]:pt-4">
            {/* Logo */}
            <div className="flex justify-center">
              <img src={logoBrown} alt="Javani Spiritual Hub" className="h-8 w-auto object-contain max-[height:760px]:h-7 xl:h-9" />
            </div>

            {/* Eyebrow + divider + title */}
            <div className="mt-3 text-center max-[height:760px]:mt-2.5 xl:mt-4">
              <p className="font-body text-[0.62rem] font-semibold tracking-[0.28em] text-gold max-[height:760px]:text-[0.58rem] max-[height:760px]:tracking-[0.24em] xl:text-[0.65rem] xl:tracking-[0.32em]">{eyebrow}</p>
              <GoldDivider className="py-1.5 max-[height:760px]:py-1 xl:py-2" />
              <h2 className="font-display text-[1.85rem] leading-[1.02] text-foreground max-[height:760px]:text-[1.55rem] xl:text-[2.05rem]">{title}</h2>
              <p className="mt-1 font-body text-[0.82rem] leading-[1.45] text-muted-foreground max-[height:760px]:text-[0.76rem] max-[height:760px]:leading-[1.35] xl:mt-1.5 xl:text-[0.86rem] xl:leading-[1.55]">{subtitle}</p>
            </div>

            {/* Form */}
            <div className="mt-4 max-[height:760px]:mt-3 xl:mt-5">{form}</div>

            {/* Footer */}
            <div className="mt-3 border-t border-gold/15 pt-3 max-[height:760px]:mt-2 max-[height:760px]:pt-2 xl:mt-4 xl:pt-4">{footer}</div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default AuthShell;