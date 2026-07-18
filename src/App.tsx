import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useParams } from "react-router-dom";
import { useEffect, lazy, Suspense, useState, type ComponentType } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import FloatingButtons from "./components/FloatingButtons";
import ScrollProgressBar from "./components/ScrollProgressBar";
import PageTransition from "./components/PageTransition";
import Navbar from "./components/Navbar";
import CartDrawer from "./components/cart/CartDrawer";
import AccountRoute from "./components/account/AccountRoute";
import ProtectedRoute from "./components/admin/ProtectedRoute";
import PartnerRoute from "./components/PartnerRoute";
import AdminLayout from "./components/admin/AdminLayout";
import PageLoader from "./components/PageLoader";
import ConfirmDialogHost from "./components/ConfirmDialogHost";
import NotificationPermissionPrompt from "./components/NotificationPermissionPrompt";
import WhatsAppPromptModal from "./components/WhatsAppPromptModal";
import { trackPageView } from "@/lib/analytics/metaPixel";

// Public pages — eagerly imported so Suspense never flashes on navigation
import Index from "./pages/Index";
import About from "./pages/About";
import Courses from "./pages/Courses";
import Classes from "./pages/Classes";
import ClassDetail from "./pages/ClassDetail";
import AccountClasses from "./pages/account/Classes";
import AccountClassRoom from "./pages/account/ClassRoom";
import Grading from "./pages/Grading";
import Gallery from "./pages/Gallery";
import Products from "./pages/Products";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import AccountProfile from "./pages/account/Profile";
import AccountOrders from "./pages/account/Orders";
import AccountOrderDetail from "./pages/account/OrderDetail";
import AccountWishlist from "./pages/account/Wishlist";
import AccountAddresses from "./pages/account/Addresses";
import AccountEmiDashboard from "./pages/account/EmiDashboard";
import Contact from "./pages/Contact";
import GuruBandhu from "./pages/GuruBandhu";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProductDetail from "./pages/ProductDetail";
import CourseDetail from "./pages/CourseDetail";
import TermsAndConditions from "./pages/TermsAndConditions";
import OnboardingPay from "./pages/OnboardingPay";

/**
 * `lazy()` that survives a failed chunk fetch.
 *
 * A dynamic import can fail for reasons that have nothing to do with the page:
 * a stale chunk hash after a redeploy (cached index.html), a flaky network, or
 * — in dev — Vite invalidating its dep bundle mid-request. React.lazy rejects,
 * and without this the whole area renders as a blank error screen.
 *
 * So: retry once, and if it still fails, reload the document a single time to
 * pick up a fresh manifest. The session flag stops a reload loop.
 */
const CHUNK_RELOAD_KEY = "javani:chunk-reloaded";
const lazyWithRetry = <T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      const module = await factory();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch {
      try {
        const module = await factory(); // transient failure — one immediate retry
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        return module;
      } catch (error) {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
          return new Promise<never>(() => {}); // the reload takes over
        }
        throw error;
      }
    }
  });

// Admin pages — lazy loaded (separate section, accessed infrequently)
const AdminLogin = lazyWithRetry(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/AdminDashboard"));
const AdminEnquiries = lazyWithRetry(() => import("./pages/admin/AdminEnquiries"));
const AdminCourses = lazyWithRetry(() => import("./pages/admin/AdminCourses"));
const AdminClasses = lazyWithRetry(() => import("./pages/admin/AdminClasses"));
const AdminPeople = lazyWithRetry(() => import("./pages/admin/AdminPeople"));
const AdminStudents = lazyWithRetry(() => import("./pages/admin/AdminStudents"));
const AdminFeeCollections = lazyWithRetry(() => import("./pages/admin/AdminFeeCollections"));
const AdminGallery = lazyWithRetry(() => import("./pages/admin/AdminGallery"));
const AdminProducts = lazyWithRetry(() => import("./pages/admin/AdminProducts"));
const AdminCoupons = lazyWithRetry(() => import("./pages/admin/AdminCoupons"));
const AdminOrders = lazyWithRetry(() => import("./pages/admin/AdminOrders"));
const AdminOrderDetail = lazyWithRetry(() => import("./pages/admin/AdminOrderDetail"));
const AdminPartners = lazyWithRetry(() => import("./pages/admin/AdminPartners"));
const AdminManagers = lazyWithRetry(() => import("./pages/admin/AdminManagers"));
const AdminActivityLog = lazyWithRetry(() => import("./pages/admin/AdminActivityLog"));
const AdminFaculty = lazyWithRetry(() => import("./pages/admin/AdminFaculty"));
const AdminFinance = lazyWithRetry(() => import("./pages/admin/AdminFinance"));
const AdminSiteSettings = lazyWithRetry(() => import("./pages/admin/AdminSiteSettings"));
const AdminPaymentSettings = lazyWithRetry(() => import("./pages/admin/AdminPaymentSettings"));
const AdminDeliverySettings = lazyWithRetry(() => import("./pages/admin/AdminDeliverySettings"));
const PartnerDashboard = lazyWithRetry(() => import("./pages/PartnerDashboard"));

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

// Fires a Meta Pixel PageView on initial load and on every client-side route change.
const MetaPixelPageViews = () => {
  const { pathname } = useLocation();
  useEffect(() => { trackPageView(); }, [pathname]);
  return null;
};

const PublicFloatingButtons = () => {
  const { pathname } = useLocation();
  if (
    pathname.startsWith("/admin") ||
    pathname === "/products" ||
    pathname.startsWith("/products/") ||
    pathname === "/cart" ||
    pathname === "/checkout" ||
    pathname.startsWith("/account") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/partner")
  ) return null;
  return <FloatingButtons />;
};

const PublicScrollProgress = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname.startsWith("/partner") || pathname.startsWith("/pay/")) return null;
  return <ScrollProgressBar />;
};

const PublicNavbar = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname.startsWith("/partner") || pathname.startsWith("/pay/") || pathname === "/login" || pathname === "/signup") return null;
  return <Navbar />;
};

const SuspenseLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="font-body text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const SharePreviewRedirect = ({ collection }: { collection: "products" | "courses" }) => {
  const { id } = useParams();
  return <Navigate to={`/${collection}/${id || ""}`} replace />;
};

const App = () => {
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    // Hide loader after it completes (1.3s for progress + 0.2s fade)
    const timer = setTimeout(() => {
      setShowLoader(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ConfirmDialogHost />
            {showLoader && <PageLoader />}
            <BrowserRouter>
              <ScrollToTop />
              <MetaPixelPageViews />
              <NotificationPermissionPrompt />
              <WhatsAppPromptModal />
              <PublicNavbar />
              <CartDrawer />
              <PublicFloatingButtons />
              <PublicScrollProgress />
              <Suspense fallback={<SuspenseLoader />}>
                <PageTransition>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/courses" element={<Courses />} />
                    <Route path="/classes" element={<Classes />} />
                    <Route path="/classes/:id" element={<ClassDetail />} />
                    <Route path="/grading" element={<Grading />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/account" element={<AccountRoute><AccountProfile /></AccountRoute>} />
                    <Route path="/account/profile" element={<AccountRoute><AccountProfile /></AccountRoute>} />
                    <Route path="/account/orders" element={<AccountRoute><AccountOrders /></AccountRoute>} />
                    <Route path="/account/classes" element={<AccountRoute><AccountClasses /></AccountRoute>} />
                    <Route path="/account/classes/:enrollmentId" element={<AccountRoute><AccountClassRoom /></AccountRoute>} />
                    <Route path="/account/emi" element={<AccountRoute><AccountEmiDashboard /></AccountRoute>} />
                    <Route path="/account/orders/:id" element={<AccountRoute><AccountOrderDetail /></AccountRoute>} />
                    <Route path="/account/wishlist" element={<AccountRoute><AccountWishlist /></AccountRoute>} />
                    <Route path="/account/addresses" element={<AccountRoute><AccountAddresses /></AccountRoute>} />
                    <Route path="/products/:id" element={<ProductDetail />} />
                    <Route path="/courses/:id" element={<CourseDetail />} />
                    <Route path="/share/products/:id" element={<SharePreviewRedirect collection="products" />} />
                    <Route path="/share/courses/:id" element={<SharePreviewRedirect collection="courses" />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/guru-bandhu" element={<GuruBandhu />} />
                    <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/pay/:token" element={<OnboardingPay />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="enquiries" element={<AdminEnquiries />} />
                      <Route path="courses" element={<AdminCourses />} />
                      <Route path="classes" element={<AdminClasses />} />
                      {/* Sign Up + Customers share one merged page (tabbed). */}
                      <Route path="enrollments" element={<AdminPeople />} />
                      <Route path="students" element={<AdminStudents />} />
                      <Route path="fee-collections" element={<AdminFeeCollections />} />
                      <Route path="payment-settings" element={<AdminPaymentSettings />} />
                      <Route path="gallery" element={<AdminGallery />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="coupons" element={<AdminCoupons />} />
                      <Route path="delivery-settings" element={<AdminDeliverySettings />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="orders/:orderId" element={<AdminOrderDetail />} />
                      <Route path="customers" element={<AdminPeople />} />
                      <Route path="partners" element={<AdminPartners />} />
                      <Route path="managers" element={<AdminManagers />} />
                      <Route path="activity" element={<AdminActivityLog />} />
                      <Route path="faculty" element={<AdminFaculty />} />
                      <Route path="finance" element={<AdminFinance />} />
                      <Route path="site-settings" element={<AdminSiteSettings />} />
                    </Route>
                    <Route path="/partner" element={<PartnerRoute><PartnerDashboard /></PartnerRoute>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </PageTransition>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
