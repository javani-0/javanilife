import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense, useState } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import FloatingButtons from "./components/FloatingButtons";
import ScrollProgressBar from "./components/ScrollProgressBar";
import PageTransition from "./components/PageTransition";
import Navbar from "./components/Navbar";
import CartDrawer from "./components/cart/CartDrawer";
import AccountRoute from "./components/account/AccountRoute";
import ProtectedRoute from "./components/admin/ProtectedRoute";
import AdminLayout from "./components/admin/AdminLayout";
import PageLoader from "./components/PageLoader";
import NotificationPermissionPrompt from "./components/NotificationPermissionPrompt";

// Public pages — eagerly imported so Suspense never flashes on navigation
import Index from "./pages/Index";
import About from "./pages/About";
import Courses from "./pages/Courses";
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
import Contact from "./pages/Contact";
import GuruBandhu from "./pages/GuruBandhu";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProductDetail from "./pages/ProductDetail";
import CourseDetail from "./pages/CourseDetail";
import TermsAndConditions from "./pages/TermsAndConditions";

// Admin pages — lazy loaded (separate section, accessed infrequently)
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminEnquiries = lazy(() => import("./pages/admin/AdminEnquiries"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses"));
const AdminGallery = lazy(() => import("./pages/admin/AdminGallery"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminPartners = lazy(() => import("./pages/admin/AdminPartners"));
const AdminFaculty = lazy(() => import("./pages/admin/AdminFaculty"));
const AdminSiteSettings = lazy(() => import("./pages/admin/AdminSiteSettings"));
const AdminDeliverySettings = lazy(() => import("./pages/admin/AdminDeliverySettings"));

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
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
    pathname === "/signup"
  ) return null;
  return <FloatingButtons />;
};

const PublicScrollProgress = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin")) return null;
  return <ScrollProgressBar />;
};

const PublicNavbar = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname === "/login" || pathname === "/signup") return null;
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
            {showLoader && <PageLoader />}
            <BrowserRouter>
              <ScrollToTop />
              <NotificationPermissionPrompt />
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
                    <Route path="/grading" element={<Grading />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/account" element={<AccountRoute><AccountProfile /></AccountRoute>} />
                    <Route path="/account/profile" element={<AccountRoute><AccountProfile /></AccountRoute>} />
                    <Route path="/account/orders" element={<AccountRoute><AccountOrders /></AccountRoute>} />
                    <Route path="/account/orders/:id" element={<AccountRoute><AccountOrderDetail /></AccountRoute>} />
                    <Route path="/account/wishlist" element={<AccountRoute><AccountWishlist /></AccountRoute>} />
                    <Route path="/account/addresses" element={<AccountRoute><AccountAddresses /></AccountRoute>} />
                    <Route path="/products/:id" element={<ProductDetail />} />
                    <Route path="/courses/:id" element={<CourseDetail />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/guru-bandhu" element={<GuruBandhu />} />
                    <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="enquiries" element={<AdminEnquiries />} />
                      <Route path="courses" element={<AdminCourses />} />
                      <Route path="gallery" element={<AdminGallery />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="delivery-settings" element={<AdminDeliverySettings />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="customers" element={<AdminCustomers />} />
                      <Route path="partners" element={<AdminPartners />} />
                      <Route path="faculty" element={<AdminFaculty />} />
                      <Route path="site-settings" element={<AdminSiteSettings />} />
                    </Route>
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
