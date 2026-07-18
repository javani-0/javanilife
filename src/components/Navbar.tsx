import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, GraduationCap, Heart, MapPin, Menu, PackageCheck, X, User, LogOut, ShoppingBag } from "lucide-react";
import PrimaryButton from "./PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/cart-context";
import logoWhite from "@/assets/logo-white.png";
import logoBrown from "@/assets/logo-brown.png";
import logoWhiteMobile from "@/assets/logo-white-mobile.png";

const navLinks = [
  { label: "Home", path: "/" },
  { label: "Courses", path: "/courses" },
  { label: "Classes", path: "/classes" },
  { label: "Products", path: "/products" },
  { label: "Contact", path: "/contact" },
];

const spiritualHubLinks = [
  { label: "About", path: "/about" },
  { label: "Gallery", path: "/gallery" },
  { label: "Grades & Diploma", path: "/grading" },
  { label: "Guru Bandhu", path: "/guru-bandhu" },
];

const accountLinks = [
  { label: "My Profile", path: "/account/profile", Icon: User },
  { label: "My Orders", path: "/account/orders", Icon: PackageCheck },
  { label: "My Classes", path: "/account/classes", Icon: GraduationCap },
  { label: "Wishlist", path: "/account/wishlist", Icon: Heart },
  { label: "Addresses", path: "/account/addresses", Icon: MapPin },
];

const GoldDiamond = ({ size = 8 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" className="text-gold">
    <path d="M10 0L12.5 7.5L20 10L12.5 12.5L10 20L7.5 12.5L0 10L7.5 7.5L10 0Z" fill="currentColor" />
  </svg>
);

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mobileSpiritualHubOpen, setMobileSpiritualHubOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const { user, userProfile, logout } = useAuth();
  const { totalItems, openCart } = useCart();
  // Admin-uploaded student photo (Student Manager) shows as the account avatar.
  const avatarUrl = userProfile?.photoURL || "";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setClosing(false);
    setMobileSpiritualHubOpen(false);
    setUserMenuOpen(false);
  }, [location]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setMobileOpen(false);
      setClosing(false);
      setMobileSpiritualHubOpen(false);
    }, 300);
  }, []);

  const isSolid = scrolled;

  const navBgClass = isSolid
    ? "backdrop-blur-xl shadow-card"
    : "bg-[#1A0A0A]/40 backdrop-blur-sm";

  const navBgStyle = isSolid
    ? { backgroundColor: "rgba(245, 237, 214, 0.97)" }
    : undefined;

  const textColor = isSolid ? "text-foreground" : "text-white/90";
  const activeColor = isSolid ? "text-gold border-b-2 border-gold" : "text-gold-light border-b-2 border-gold-light";
  const hoverColor = isSolid ? "hover:text-gold" : "hover:text-gold-light";
  const isSpiritualHubActive = spiritualHubLinks.some((link) => location.pathname === link.path);
  // A top-level link is active on its page AND its detail pages, e.g. "/classes"
  // stays highlighted on "/classes/:id". Home ("/") only matches exactly.
  const isLinkActive = (path: string) =>
    path === "/" ? location.pathname === "/" : (location.pathname === path || location.pathname.startsWith(`${path}/`));

  const showMobile = mobileOpen || closing;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 ${navBgClass}`}
        style={{ height: "80px", ...navBgStyle }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          {/* Brand */}
          <Link to="/" className="flex items-center" data-navbar-brand>
            <img
              src={isSolid ? logoBrown : logoWhite}
              alt="Javani Spiritual Hub"
              className="h-10 sm:h-12 w-auto object-contain transition-opacity duration-300"
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6 xl:gap-8">
            {navLinks.map((link) => (
              link.path === "/courses" ? (
                <div key="spiritual-hub-and-courses" className="flex items-center gap-6 xl:gap-8">
                  <div className="relative group">
                    <button
                      type="button"
                      className={`font-body font-medium text-[0.85rem] xl:text-[0.9rem] relative pb-1 transition-colors duration-300 flex items-center gap-1 ${
                        isSpiritualHubActive ? activeColor : `${textColor} ${hoverColor}`
                      }`}
                    >
                      Spiritual Hub <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                    </button>
                    <div className="absolute left-1/2 top-full mt-3 w-56 -translate-x-1/2 rounded-lg border border-border/50 bg-card shadow-hero opacity-0 invisible translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 overflow-hidden">
                      {spiritualHubLinks.map((hubLink) => (
                        <Link
                          key={hubLink.path}
                          to={hubLink.path}
                          className={`block px-4 py-3 font-body text-[0.85rem] transition-colors ${location.pathname === hubLink.path ? "bg-gold/10 text-gold" : "text-foreground hover:bg-gold/10 hover:text-gold"}`}
                        >
                          {hubLink.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <Link
                    to={link.path}
                    className={`font-body font-medium text-[0.85rem] xl:text-[0.9rem] relative pb-1 transition-colors duration-300 ${
                      isLinkActive(link.path)
                        ? activeColor
                        : `${textColor} ${hoverColor}`
                    }`}
                  >
                    {link.label}
                  </Link>
                </div>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`font-body font-medium text-[0.85rem] xl:text-[0.9rem] relative pb-1 transition-colors duration-300 ${
                    isLinkActive(link.path)
                      ? activeColor
                      : `${textColor} ${hoverColor}`
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}
          </div>

          {/* CTA / Auth */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              type="button"
              onClick={openCart}
              className={`relative w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300 ${
                isSolid
                  ? "border-gold/40 text-foreground hover:bg-gold/10"
                  : "border-white/30 text-white/90 hover:bg-white/10"
              }`}
              aria-label={`Open cart with ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="w-4 h-4" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-gold text-charcoal text-[0.65rem] font-body font-bold flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>
            <Link to="/contact">
              <PrimaryButton compact>Enquire Now</PrimaryButton>
            </Link>
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all duration-300 ${
                    isSolid
                      ? "border-gold/50 text-foreground hover:bg-gold/10"
                      : "border-white/40 text-white/90 hover:bg-white/10"
                  }`}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-card shadow-hero rounded-lg border border-border/50 overflow-hidden z-[1000]">
                      {accountLinks.map(({ label, path, Icon }) => (
                        <Link
                          key={path}
                          to={path}
                          className="flex items-center gap-2 w-full px-4 py-3 font-body text-[0.85rem] text-foreground hover:bg-gold/10 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-gold" /> {label}
                        </Link>
                      ))}
                      <button
                        onClick={async () => {
                          await logout();
                          setUserMenuOpen(false);
                          navigate("/");
                        }}
                        className="flex items-center gap-2 w-full px-4 py-3 font-body text-[0.85rem] text-destructive hover:bg-destructive/10 transition-colors border-t border-border/50"
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className={`font-body font-medium text-[0.85rem] px-4 py-2 rounded-md border transition-all duration-300 ${
                  isSolid
                    ? "border-gold/30 text-foreground hover:bg-gold/10"
                    : "border-white/20 text-white/90 hover:bg-white/10"
                }`}
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="lg:hidden flex items-center gap-1">
            {user && (
              <Link
                to="/account/profile"
                className={`relative p-2 transition-colors ${textColor}`}
                aria-label="Open account"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-6 w-6 rounded-full border border-gold/40 object-cover" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </Link>
            )}
            <button
              type="button"
              onClick={openCart}
              className={`relative p-2 transition-colors ${textColor}`}
              aria-label={`Open cart with ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-gold text-charcoal text-[0.6rem] font-body font-bold flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>
            <button
              data-hamburger-btn
              className={`p-2 transition-colors ${textColor}`}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      {/* Premium Mobile Menu */}
      {showMobile && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex flex-col"
          style={{
            background: "linear-gradient(165deg, hsl(0 68% 18%) 0%, hsl(0 44% 7%) 50%, hsl(0 30% 5%) 100%)",
            animation: closing ? "menuFadeOut 0.3s ease-in forwards" : "menuFadeIn 0.4s ease-out forwards",
          }}
        >
          {/* Header: Brand + Close */}
          <div className="flex items-center justify-between px-6 pt-4 pb-3">
            <img src={logoWhiteMobile} alt="Javani Spiritual Hub" className="h-12 w-auto object-contain" />
            <button
              onClick={handleClose}
              className="p-2 rounded-full border border-transparent hover:border-gold/40 transition-all duration-300 group"
              aria-label="Close menu"
            >
              <X className="w-7 h-7 text-white/70 group-hover:text-gold transition-colors duration-300" />
            </button>
          </div>

          {/* Gold accent line */}
          <div className="mx-6 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

          {/* Nav Links */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 px-6 py-6">
            {navLinks.map((link, i) => {
              const isActive = isLinkActive(link.path);
              return (
                <div key={link.path} className="flex flex-col items-center">
                  {link.path === "/courses" && (
                    <div
                      className="mb-3 w-full max-w-md"
                      style={{
                        opacity: 0,
                        animation: closing
                          ? "none"
                          : `menuItemSlideIn 0.5s ease-out ${0.15 + i * 0.06}s forwards`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setMobileSpiritualHubOpen((currentValue) => !currentValue)}
                        className={`mx-auto flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 font-display text-[1.35rem] sm:text-[1.55rem] tracking-wide transition-all duration-300 ${isSpiritualHubActive || mobileSpiritualHubOpen ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-white/80 hover:border-gold/40 hover:text-gold"}`}
                        aria-expanded={mobileSpiritualHubOpen}
                        aria-controls="mobile-spiritual-hub-links"
                        style={{ letterSpacing: "0.04em" }}
                      >
                        Spiritual Hub
                        <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${mobileSpiritualHubOpen ? "rotate-180" : ""}`} />
                      </button>
                      <div
                        id="mobile-spiritual-hub-links"
                        className={`grid overflow-hidden transition-all duration-300 ${mobileSpiritualHubOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="grid grid-cols-2 gap-2 px-1 pt-1">
                            {spiritualHubLinks.map((hubLink) => (
                              <Link
                                key={hubLink.path}
                                to={hubLink.path}
                                className={`rounded-md border px-3 py-2 text-center font-body text-[0.82rem] transition-colors ${location.pathname === hubLink.path ? "border-gold/60 text-gold bg-gold/10" : "border-white/15 text-white/70 hover:border-gold/50 hover:text-gold"}`}
                              >
                                {hubLink.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <Link
                    to={link.path}
                    className="group flex items-center gap-3 py-3 px-4 rounded-lg transition-all duration-300"
                    style={{
                      opacity: 0,
                      animation: closing
                        ? "none"
                        : `menuItemSlideIn 0.5s ease-out ${0.18 + i * 0.06}s forwards`,
                    }}
                  >
                    <span className={`transition-all duration-300 ${isActive ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}>
                      <GoldDiamond size={7} />
                    </span>
                    <span
                      className={`font-display text-[1.5rem] sm:text-[1.7rem] tracking-wide transition-all duration-300 ${
                        isActive
                          ? "text-gold font-semibold"
                          : "text-white/80 group-hover:text-gold group-hover:translate-x-1"
                      }`}
                      style={{ letterSpacing: "0.04em" }}
                    >
                      {link.label}
                    </span>
                  </Link>
                </div>
              );
            })}

            {/* Gold divider before CTA */}
            <div
              className="flex items-center gap-3 mt-4 mb-2 w-48"
              style={{
                opacity: 0,
                animation: closing
                  ? "none"
                  : `menuItemSlideIn 0.5s ease-out ${0.15 + navLinks.length * 0.06}s forwards`,
              }}
            >
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/30" />
              <GoldDiamond size={6} />
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/30" />
            </div>

            {/* CTA */}
            <div
              style={{
                opacity: 0,
                animation: closing
                  ? "none"
                  : `menuItemSlideIn 0.5s ease-out ${0.2 + navLinks.length * 0.06}s forwards`,
              }}
            >
              <Link to="/contact">
                <PrimaryButton className="mt-2 px-8">Enquire Now</PrimaryButton>
              </Link>
            </div>

            {/* Auth buttons for mobile */}
            <div
              className="flex flex-col items-center gap-2 mt-3"
              style={{
                opacity: 0,
                animation: closing
                  ? "none"
                  : `menuItemSlideIn 0.5s ease-out ${0.25 + navLinks.length * 0.06}s forwards`,
              }}
            >
              {user ? (
                <>
                  <Link
                    to="/account/profile"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-md border border-gold/40 text-gold font-body text-[0.9rem] font-medium hover:bg-gold/10 transition-colors"
                  >
                    <User className="w-4 h-4" /> My Account
                  </Link>
                  <button
                    onClick={async () => {
                      await logout();
                      handleClose();
                      navigate("/");
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-md border border-white/20 text-white/70 font-body text-[0.9rem] font-medium hover:bg-white/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    to="/login"
                    className="px-6 py-2.5 rounded-md border border-gold/40 text-gold font-body text-[0.9rem] font-medium hover:bg-gold/10 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="px-6 py-2.5 rounded-md bg-gold text-charcoal font-body text-[0.9rem] font-medium hover:bg-gold-light transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Bottom decorative accent */}
          <div className="flex flex-col items-center pb-8 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-px bg-gold/20" />
              <GoldDiamond size={5} />
              <div className="w-8 h-px bg-gold/20" />
            </div>
            <span className="font-display text-[0.55rem] tracking-[0.4em] text-white/20 uppercase">Est. 2022</span>
          </div>
        </div>,
        document.body
      )}

      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes menuFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes menuFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes menuItemSlideIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
};

export default Navbar;
