import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowLeft, GraduationCap, Heart, MapPin, PackageCheck, UserRound } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import heroTemple from "@/assets/hero-temple.jpg";

const accountLinks = [
  { label: "Profile", path: "/account/profile", Icon: UserRound },
  { label: "Orders", path: "/account/orders", Icon: PackageCheck },
  { label: "Classes", path: "/account/classes", Icon: GraduationCap },
  { label: "Wishlist", path: "/account/wishlist", Icon: Heart },
  { label: "Addresses", path: "/account/addresses", Icon: MapPin },
];

interface AccountLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
}

const AccountLayout = ({ title, description, children }: AccountLayoutProps) => (
  <div className="min-h-screen overflow-x-hidden bg-background">
    <SEO title={`${title} | Javani Spiritual Hub`} description={description} />
    <PageHero
      backgroundImages={[heroTemple]}
      label="My Account"
      heading={title}
      subtext={description}
      breadcrumb={[{ label: "Home", path: "/" }, { label: "Account" }]}
      size="compact"
    />

    <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <Link to="/products" className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold/40 bg-card px-4 py-2 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="grid gap-4 lg:grid-cols-[250px_1fr] lg:gap-6">
        <div className="lg:hidden -mx-1 mb-1">
          <div className="rounded-2xl border border-gold/15 bg-card/95 p-3 shadow-card backdrop-blur">
            <div className="mb-3 flex flex-col gap-2">
              <div>
                <p className="font-display text-lg text-foreground">Account Sections</p>
                <p className="font-body text-xs text-muted-foreground">Choose a section and the content appears below.</p>
              </div>
              <span className="w-fit rounded-full bg-gold/10 px-2.5 py-1 font-body text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-gold">
                Quick Access
              </span>
            </div>
            <nav className="grid grid-cols-2 gap-2">
              {accountLinks.map(({ label, path, Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `flex min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center font-body text-sm font-semibold transition-colors ${isActive ? "border-gold bg-gold text-charcoal shadow-sm" : "border-border/70 bg-background text-muted-foreground hover:border-gold/40 hover:bg-gold/10 hover:text-gold"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        <aside className="hidden h-fit rounded-2xl border border-gold/15 bg-card p-3 shadow-card lg:sticky lg:top-28 lg:block">
          <nav className="grid gap-2 sm:grid-cols-4 lg:grid-cols-1">
            {accountLinks.map(({ label, path, Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => `flex items-center justify-center gap-2 rounded-xl px-3 py-3 font-body text-sm font-semibold transition-colors sm:justify-start ${isActive ? "bg-gold text-charcoal" : "text-muted-foreground hover:bg-gold/10 hover:text-gold"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-gold/15 bg-gradient-to-r from-gold/10 via-card to-card px-4 py-3 shadow-sm lg:hidden">
            <p className="font-display text-xl text-foreground">{title}</p>
            <p className="mt-1 font-body text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </section>
      </div>
    </main>

    <Footer />
  </div>
);

export default AccountLayout;