import { useLocation, useNavigate } from "react-router-dom";
import { UserCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AdminEnrollments from "./AdminEnrollments";
import AdminCustomers from "./AdminCustomers";

// ---------------------------------------------------------------------------
// "Sign Up & Customers" (req): the former Sign Up (class enrolments) and
// Customers pages merged behind one nav item with a tab switcher. The tabs
// NAVIGATE (not just toggle) so manager per-page access keeps working —
// ProtectedRoute still gates /admin/enrollments and /admin/customers by the
// manager's own page keys.
// ---------------------------------------------------------------------------

const AdminPeople = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const isManager = userProfile?.role === "manager";
  const pages = userProfile?.managerPages || [];
  const canSeeEnrollments = !isManager || pages.includes("enrollments");
  const canSeeCustomers = !isManager || pages.includes("customers");
  const tab = location.pathname.startsWith("/admin/customers") ? "customers" : "enrollments";

  return (
    <div className="space-y-5">
      {(canSeeEnrollments && canSeeCustomers) && (
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-card">
          <button
            onClick={() => navigate("/admin/enrollments")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${tab === "enrollments" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
          >
            <UserCheck className="h-4 w-4" /> Sign Up (Enrolments)
          </button>
          <button
            onClick={() => navigate("/admin/customers")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${tab === "customers" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
          >
            <Users className="h-4 w-4" /> Customers
          </button>
        </div>
      )}
      {tab === "customers" ? <AdminCustomers /> : <AdminEnrollments />}
    </div>
  );
};

export default AdminPeople;
