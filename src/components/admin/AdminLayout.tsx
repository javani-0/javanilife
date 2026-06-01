import { useState } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, ClipboardList, BookOpen, Image, ShoppingBag, Users,
  Handshake, SlidersHorizontal, LogOut, Menu, X, PackageCheck,
  ChevronLeft, ChevronRight, TicketPercent, Truck,
  GraduationCap, UserCheck, Wallet,
} from "lucide-react";
import logoWhite from "@/assets/logo-white.png";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Enquiries", icon: ClipboardList, path: "/admin/enquiries" },
  { label: "Courses Manager", icon: BookOpen, path: "/admin/courses" },
  { label: "Classes Manager", icon: GraduationCap, path: "/admin/classes" },
  { label: "Enrollments", icon: UserCheck, path: "/admin/enrollments" },
  { label: "Fee Collections", icon: Wallet, path: "/admin/fee-collections" },
  { label: "Gallery Manager", icon: Image, path: "/admin/gallery" },
  { label: "Products Manager", icon: ShoppingBag, path: "/admin/products" },
  { label: "Coupons", icon: TicketPercent, path: "/admin/coupons" },
  { label: "Delivery Settings", icon: Truck, path: "/admin/delivery-settings" },
  { label: "Orders Manager", icon: PackageCheck, path: "/admin/orders" },
  { label: "Customers", icon: Users, path: "/admin/customers" },
  { label: "Partners Manager", icon: Handshake, path: "/admin/partners" },
  { label: "Faculty Manager", icon: Users, path: "/admin/faculty" },
  { label: "Site Settings", icon: SlidersHorizontal, path: "/admin/site-settings" },
];

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const currentPage = navItems.find((n) => location.pathname.startsWith(n.path))?.label || "Dashboard";

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  /* ── Shared nav list used by both desktop and mobile sidebars ── */
  const NavItems = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto sidebar-scroll">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onNav}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md font-body text-[0.875rem] transition-all duration-200 ${
              collapsed ? "justify-center" : ""
            } ${
              isActive
                ? "text-gold bg-gold/[0.12] border-l-[3px] border-gold"
                : "text-white/60 hover:text-gold hover:bg-gold/[0.08] border-l-[3px] border-transparent"
            }`
          }
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );

  return (
    /* Full-viewport flex container — overflow hidden so only main scrolls */
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background lg:h-dvh lg:min-h-dvh lg:overflow-hidden">

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden`}
        style={{ background: "#1A0A0A", width: collapsed ? "64px" : "260px" }}
      >
        {/* Logo + collapse toggle */}
        <div className={`border-b border-white/10 flex items-center justify-between px-3 min-h-[64px] ${collapsed ? "flex-col py-3 gap-2" : "py-3"}`}>
          {collapsed ? (
            <>
              <div className="w-9 h-9 rounded bg-gold/20 flex items-center justify-center">
                <span className="text-gold font-bold text-base font-display">J</span>
              </div>
              <button
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
                className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-gold hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <img src={logoWhite} alt="Javani" className="h-10 w-auto object-contain" />
                <span className="inline-block px-2 py-0.5 rounded text-[0.58rem] font-body text-white/50 bg-white/10 tracking-widest uppercase w-fit">Admin</span>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-gold hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <NavItems />

        {/* Bottom: email + logout + collapse toggle */}
        <div className="border-t border-white/10 p-3 flex flex-col gap-1">
          {!collapsed && (
            <p className="font-body text-[0.72rem] text-white/40 truncate px-1 mb-1">{user?.email}</p>
          )}
          <button
            onClick={handleLogout}
            title="Sign Out"
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-md font-body text-[0.8rem] text-white/60 hover:text-destructive hover:bg-destructive/10 transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col overflow-y-auto" style={{ background: "#1A0A0A" }}>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="border-b border-white/10 flex flex-col items-start p-6 gap-2">
              <img src={logoWhite} alt="Javani" className="h-12 w-auto object-contain" />
              <span className="inline-block px-3 py-0.5 rounded text-[0.65rem] font-body text-white/60 bg-white/10 tracking-widest uppercase">Admin</span>
            </div>
            <nav className="flex-1 py-4 space-y-1 px-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-md font-body text-[0.875rem] transition-all duration-200 ${
                      isActive
                        ? "text-gold bg-gold/[0.12] border-l-[3px] border-gold"
                        : "text-white/60 hover:text-gold hover:bg-gold/[0.08] border-l-[3px] border-transparent"
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="p-4 border-t border-white/10">
              <p className="font-body text-[0.72rem] text-white/40 truncate mb-2">{user?.email}</p>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md font-body text-[0.8rem] text-white/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main area: fixed header + scrollable content + fixed footer ── */}
      <div className="flex w-full min-w-0 max-w-full flex-1 flex-col lg:h-dvh lg:min-h-dvh lg:overflow-hidden">

        {/* Fixed Header */}
        <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-ivory/97 px-4 shadow-sm backdrop-blur-sm sm:px-6 lg:static">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden text-foreground"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-display text-[1.1rem] font-semibold text-foreground sm:text-[1.3rem]">{currentPage}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-body font-bold text-[0.75rem]">
              {user?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <span className="hidden sm:inline font-body text-[0.85rem] text-foreground">{user?.email?.split("@")[0]}</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="admin-scroll w-full max-w-full flex-1 overflow-x-hidden p-3 pb-6 sm:p-5 sm:pb-8 md:p-8 lg:overflow-y-auto">
          <div key={location.pathname} className="admin-page-enter">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-auto flex min-h-10 flex-shrink-0 items-center justify-center border-t border-border bg-ivory/97 px-3 py-2 sm:px-6 lg:h-10 lg:py-0">
          <p className="text-center font-body text-[0.65rem] leading-tight text-muted-foreground sm:text-[0.7rem]">
            © {new Date().getFullYear()} Javani Spiritual Hub &middot; Admin Panel
          </p>
        </footer>

      </div>
    </div>
  );
};

export default AdminLayout;
