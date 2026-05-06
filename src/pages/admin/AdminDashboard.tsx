import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";
import { ClipboardList, TrendingUp, Clock, ShoppingBag, Check, Trash2, LayoutGrid, List } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface Enquiry {
  id: string;
  name: string;
  phone: string;
  course: string;
  experienceLevel: string;
  timestamp: Timestamp | null;
  status: string;
}

const statusColors: Record<string, string> = {
  new: "bg-destructive/10 text-destructive",
  contacted: "bg-blue-100 text-blue-700",
  enrolled: "bg-green-100 text-green-700",
  closed: "bg-muted text-muted-foreground",
  pending: "bg-yellow-100 text-yellow-700",
};

const AdminDashboard = () => {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [allEnquiries, setAllEnquiries] = useState<Enquiry[]>([]);
  const [coursesCount, setCoursesCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "enquiries"), orderBy("timestamp", "desc"), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      setEnquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)));
    });

    const unsubAll = onSnapshot(collection(db, "enquiries"), (snap) => {
      setAllEnquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)));
    });

    const unsubCourses = onSnapshot(collection(db, "courses"), (snap) => {
      setCoursesCount(snap.size);
    });

    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProductsCount(snap.size);
    });

    return () => { unsub(); unsubAll(); unsubCourses(); unsubProducts(); };
  }, []);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const newToday = allEnquiries.filter((e) => e.timestamp && e.timestamp.toDate() >= todayStart).length;
  const pendingCount = allEnquiries.filter((e) => e.status === "new" || e.status === "pending").length;

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = allEnquiries.filter((e) => {
      if (!e.timestamp) return false;
      const t = e.timestamp.toDate();
      return t >= d && t < next;
    }).length;
    return { day: d.toLocaleDateString("en-IN", { weekday: "short" }), count };
  });

  const markContacted = async (id: string) => {
    try {
      await updateDoc(doc(db, "enquiries", id), { status: "contacted" });
      toast({ title: "Status updated" });
    } catch { toast({ title: "Error updating", variant: "destructive" }); }
  };

  const deleteEnquiry = async (id: string) => {
    if (!confirm("Delete this enquiry?")) return;
    try {
      await deleteDoc(doc(db, "enquiries", id));
      toast({ title: "Enquiry deleted" });
    } catch { toast({ title: "Error deleting", variant: "destructive" }); }
  };

  const stats = [
    { label: "Total Enquiries", value: allEnquiries.length, icon: ClipboardList, color: "text-primary", link: "/admin/enquiries" },
    { label: "Today Enquiries", value: newToday, icon: TrendingUp, color: "text-green-600", link: "/admin/enquiries" },
    { label: "Pending Follow-up", value: pendingCount, icon: Clock, color: "text-gold", link: "/admin/enquiries" },
    { label: "Products Listed", value: productsCount, icon: ShoppingBag, color: "text-blue-600", link: "/admin/products" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
        {stats.map((s) => (
          <div key={s.label} onClick={() => navigate(s.link)} className="bg-card shadow-card rounded-lg p-4 sm:p-7 hover:-translate-y-1 transition-transform duration-300 cursor-pointer">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted flex items-center justify-center ${s.color}`}>
                <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            <p className="font-display font-bold text-[2rem] sm:text-[3rem] leading-none text-foreground">{s.value}</p>
            <p className="font-body font-medium text-[0.75rem] sm:text-[0.875rem] text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart + Enquiries */}
      <div className="grid xl:grid-cols-[1fr_1.5fr] gap-4 sm:gap-6">
        {/* Chart */}
        <div className="bg-card shadow-card rounded-lg p-4 sm:p-6">
          <h3 className="font-display font-semibold text-[1.1rem] sm:text-[1.3rem] text-foreground mb-4">Enquiry Activity (7 Days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="day" tick={{ fontSize: 12, fontFamily: "Inter" }} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fontFamily: "Inter" }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 13 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Enquiries */}
        <div className="bg-card shadow-card rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-[1.1rem] sm:text-[1.3rem] text-foreground">Recent Enquiries</h3>
            <div className="flex items-center gap-2">
              <div className="flex border border-border rounded-md overflow-hidden">
                <button onClick={() => setViewMode("grid")} className={`p-1.5 sm:p-2 ${viewMode === "grid" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
                <button onClick={() => setViewMode("table")} className={`p-1.5 sm:p-2 ${viewMode === "table" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><List className="w-3.5 h-3.5" /></button>
              </div>
              <a href="/admin/enquiries" className="font-body text-[0.8rem] sm:text-[0.85rem] text-gold hover:underline">View All →</a>
            </div>
          </div>

          {enquiries.length === 0 ? (
            <p className="py-8 text-center font-body text-muted-foreground">No enquiries yet</p>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {enquiries.map((e) => (
                <div key={e.id} className="bg-background border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-body font-medium text-[0.9rem] text-foreground truncate mr-2">{e.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full font-body text-[0.7rem] font-medium whitespace-nowrap ${statusColors[e.status] || statusColors.new}`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="font-body text-[0.8rem] text-muted-foreground mb-1">{e.phone}</p>
                  <p className="font-body text-[0.8rem] text-muted-foreground mb-3">{e.course}</p>
                  <div className="flex gap-1 pt-2 border-t border-border/50">
                    <button title="Mark contacted" onClick={() => markContacted(e.id)} className="p-1.5 rounded text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button title="Delete" onClick={() => deleteEnquiry(e.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["Name", "Phone", "Course", "Status", "Actions"].map((h) => (
                      <th key={h} className="pb-3 font-body font-medium text-[0.8rem] text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 pr-4 font-body text-[0.875rem] text-foreground">{e.name}</td>
                      <td className="py-3 pr-4 font-body text-[0.875rem] text-muted-foreground">{e.phone}</td>
                      <td className="py-3 pr-4 font-body text-[0.85rem] text-muted-foreground">{e.course}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded-full font-body text-[0.75rem] font-medium ${statusColors[e.status] || statusColors.new}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <button title="Mark contacted" onClick={() => markContacted(e.id)} className="p-1.5 rounded text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button title="Delete" onClick={() => deleteEnquiry(e.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
