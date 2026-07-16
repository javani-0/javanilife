import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { firstAllowedPath, managerCanAccessPath } from "@/lib/adminPages";

const AccessDenied = ({ message }: { message: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center max-w-sm mx-auto px-4">
      <h2 className="font-display font-semibold text-[1.5rem] text-foreground mb-3">Access Denied</h2>
      <p className="font-body text-muted-foreground mb-6">{message}</p>
      <a href="/" className="inline-block px-6 py-2.5 rounded-md bg-gradient-primary text-primary-foreground font-body text-[0.875rem] font-medium">Go to Home</a>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-accent text-[1.4rem] text-gold mb-2">Javani</h1>
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Not logged in at all
  if (!user) return <Navigate to="/admin/login" replace />;

  // Managers (admin-created) may open ONLY the pages the admin switched on.
  if (userProfile && userProfile.role === "manager") {
    const pages = userProfile.managerPages || [];
    const landing = firstAllowedPath(pages);
    if (!landing) return <AccessDenied message="No admin pages have been enabled for your account yet. Ask the admin to switch on your access." />;
    // /admin and /admin/dashboard aren't manager pages — land on the first allowed one.
    if (location.pathname === "/admin" || location.pathname === "/admin/" || location.pathname.startsWith("/admin/dashboard")) {
      return <Navigate to={landing} replace />;
    }
    if (!managerCanAccessPath(pages, location.pathname)) {
      return <Navigate to={landing} replace />;
    }
    return <>{children}</>;
  }

  // Logged in but not an admin — send back to home
  if (userProfile && userProfile.role !== "admin") {
    return <AccessDenied message="You don't have permission to access the admin area." />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
