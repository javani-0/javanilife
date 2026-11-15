import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AuthLoader from "@/components/AuthLoader";

// Guard for the partner area. Admins are allowed through too (they own the data).
const PartnerRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <AuthLoader />;

  if (!user) return <Navigate to="/login?redirect=%2Fpartner" replace />;

  if (userProfile && userProfile.role !== "partner" && userProfile.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="mx-auto max-w-sm text-center">
          <h2 className="mb-3 font-display text-[1.5rem] font-semibold text-foreground">Access Denied</h2>
          <p className="mb-6 font-body text-muted-foreground">This area is for partners only.</p>
          <a href="/" className="inline-block rounded-md bg-gradient-primary px-6 py-2.5 font-body text-[0.875rem] font-medium text-primary-foreground">Go to Home</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PartnerRoute;
