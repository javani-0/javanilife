import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Download, X, MessageCircle, Eye, Trash2, ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email: string;
  age: number;
  gender: string;
  location: string;
  course: string;
  experienceLevel: string;
  batchPreference: string[];
  message: string;
  heardFrom: string;
  enquiryFor: string;
  status: string;
  notes?: string;
  timestamp: any;
}

const statusColors: Record<string, string> = {
  new: "bg-destructive/10 text-destructive",
  contacted: "bg-blue-100 text-blue-700",
  enrolled: "bg-green-100 text-green-700",
  closed: "bg-muted text-muted-foreground",
  pending: "bg-yellow-100 text-yellow-700",
};

const PAGE_SIZE = 20;

const AdminEnquiries = () => {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const { toast } = useToast();

  useEffect(() => {
    const q = query(collection(db, "enquiries"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEnquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)));
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    let list = enquiries;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s) || e.phone?.includes(s));
    }
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (courseFilter !== "all") list = list.filter((e) => e.course === courseFilter);
    if (dateFilter !== "all") {
      const now = new Date();
      const start = new Date();
      if (dateFilter === "today") start.setHours(0, 0, 0, 0);
      else if (dateFilter === "week") start.setDate(now.getDate() - 7);
      list = list.filter((e) => e.timestamp && e.timestamp.toDate() >= start);
    }
    return list;
  }, [enquiries, search, statusFilter, courseFilter, dateFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const courses = useMemo(() => [...new Set(enquiries.map((e) => e.course).filter(Boolean))], [enquiries]);

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "enquiries", id), { status });
    if (selectedEnquiry?.id === id) setSelectedEnquiry((p) => p ? { ...p, status } : null);
    toast({ title: `Status updated to ${status}` });
  };

  const saveNotes = async () => {
    if (!selectedEnquiry) return;
    await updateDoc(doc(db, "enquiries", selectedEnquiry.id), { notes });
    toast({ title: "Notes saved" });
  };

  const deleteEnquiry = async (id: string) => {
    if (!confirm("Delete this enquiry permanently?")) return;
    await deleteDoc(doc(db, "enquiries", id));
    if (selectedEnquiry?.id === id) setSelectedEnquiry(null);
    toast({ title: "Enquiry deleted" });
  };

  const exportCSV = () => {
    const headers = ["Name", "Phone", "Email", "Age", "Course", "Experience", "Status", "Date"];
    const rows = filtered.map((e) => [
      e.name, e.phone, e.email, e.age, e.course, e.experienceLevel, e.status,
      e.timestamp ? e.timestamp.toDate().toLocaleDateString() : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enquiries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = (e: Enquiry) => {
    setSelectedEnquiry(e);
    setNotes(e.notes || "");
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-card font-body text-[0.875rem] outline-none focus:border-gold" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none">
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="enrolled">Enrolled</option>
          <option value="closed">Closed</option>
        </select>
        <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none">
          <option value="all">All Courses</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-md border border-border bg-card font-body text-[0.85rem] outline-none">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
        </select>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode("grid")} className={`p-2.5 ${viewMode === "grid" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="w-4 h-4" /></button>
          <button onClick={() => setViewMode("table")} className={`p-2.5 ${viewMode === "table" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><List className="w-4 h-4" /></button>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-gold text-gold-foreground font-body text-[0.85rem] font-medium hover:brightness-110 transition-all">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-card rounded-lg shadow-card">
              <p className="font-body text-muted-foreground">No enquiries found</p>
            </div>
          ) : paged.map((e) => (
            <div key={e.id} className="bg-card shadow-card rounded-lg p-5 hover:shadow-hero transition-shadow cursor-pointer" onClick={() => openDetail(e)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-display font-semibold text-[1rem] text-foreground">{e.name}</h4>
                  <p className="font-body text-[0.8rem] text-muted-foreground">{e.phone}</p>
                </div>
                <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] font-medium ${statusColors[e.status] || statusColors.new}`}>{e.status}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                <p className="font-body text-[0.8rem] text-muted-foreground"><span className="text-foreground font-medium">Course:</span> {e.course}</p>
                <p className="font-body text-[0.8rem] text-muted-foreground"><span className="text-foreground font-medium">Experience:</span> <span className="capitalize">{e.experienceLevel}</span></p>
                {e.email && <p className="font-body text-[0.8rem] text-muted-foreground truncate">{e.email}</p>}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <span className="font-body text-[0.75rem] text-muted-foreground">{e.timestamp ? e.timestamp.toDate().toLocaleDateString() : "—"}</span>
                <div className="flex gap-1" onClick={(ev) => ev.stopPropagation()}>
                  <button title="View" onClick={() => openDetail(e)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-4 h-4" /></button>
                  <button title="Delete" onClick={() => deleteEnquiry(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-card shadow-card rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Name", "Phone", "Email", "Course", "Experience", "Status", "Date", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-body font-medium text-[0.75rem] text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center font-body text-muted-foreground">No enquiries found</td></tr>
                ) : paged.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => openDetail(e)}>
                    <td className="px-4 py-3 font-body text-[0.875rem] text-foreground font-medium">{e.name}</td>
                    <td className="px-4 py-3 font-body text-[0.85rem] text-muted-foreground">{e.phone}</td>
                    <td className="px-4 py-3 font-body text-[0.85rem] text-muted-foreground">{e.email || "—"}</td>
                    <td className="px-4 py-3 font-body text-[0.85rem] text-muted-foreground">{e.course}</td>
                    <td className="px-4 py-3 font-body text-[0.85rem] text-muted-foreground capitalize">{e.experienceLevel}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full font-body text-[0.7rem] font-medium ${statusColors[e.status] || statusColors.new}`}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 font-body text-[0.8rem] text-muted-foreground">{e.timestamp ? e.timestamp.toDate().toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex gap-1">
                        <button title="View" onClick={() => openDetail(e)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-4 h-4" /></button>
                        <button title="Delete" onClick={() => deleteEnquiry(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="p-2 rounded hover:bg-muted disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-body text-[0.85rem] text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="p-2 rounded hover:bg-muted disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEnquiry && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedEnquiry(null)} />
          <div className="relative w-full max-w-2xl bg-card shadow-hero rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between z-10 rounded-t-xl">
              <h3 className="font-display font-semibold text-[1.4rem] text-foreground">Enquiry Details</h3>
              <button onClick={() => setSelectedEnquiry(null)} className="p-2 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["Name", selectedEnquiry.name],
                  ["Phone", selectedEnquiry.phone],
                  ["Email", selectedEnquiry.email || "—"],
                  ["Age", selectedEnquiry.age],
                  ["Gender", selectedEnquiry.gender],
                  ["Location", selectedEnquiry.location],
                  ["Course", selectedEnquiry.course],
                  ["Experience", selectedEnquiry.experienceLevel],
                  ["Batch Pref", selectedEnquiry.batchPreference?.join(", ") || "—"],
                  ["Heard From", selectedEnquiry.heardFrom || "—"],
                  ["Enquiry For", selectedEnquiry.enquiryFor || "—"],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="font-body text-[0.75rem] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="font-body text-[0.9rem] text-foreground capitalize">{String(value)}</p>
                  </div>
                ))}
              </div>

              {selectedEnquiry.message && (
                <div>
                  <p className="font-body text-[0.75rem] text-muted-foreground uppercase tracking-wider mb-1">Message</p>
                  <p className="font-body text-[0.875rem] text-foreground bg-muted/50 p-3 rounded">{selectedEnquiry.message}</p>
                </div>
              )}

              <div>
                <label className="font-body text-[0.75rem] text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
                <select
                  value={selectedEnquiry.status}
                  onChange={(e) => updateStatus(selectedEnquiry.id, e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card font-body text-[0.875rem] outline-none focus:border-gold"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="font-body text-[0.75rem] text-muted-foreground uppercase tracking-wider mb-1 block">Admin Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-border bg-card font-body text-[0.875rem] outline-none focus:border-gold" placeholder="Add internal notes..." />
                <button onClick={saveNotes} className="mt-2 px-4 py-2 rounded-md bg-gold text-gold-foreground font-body text-[0.8rem] font-medium hover:brightness-110">Save Notes</button>
              </div>

              <div className="flex gap-3">
                <a
                  href={`https://wa.me/${selectedEnquiry.phone?.replace(/[\s\-+]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#25D366] text-white font-body text-[0.85rem] font-medium hover:bg-[#128C7E] transition-colors flex-1 justify-center"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp Student
                </a>
                <button
                  onClick={() => updateStatus(selectedEnquiry.id, "enrolled")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-green-600 text-white font-body text-[0.85rem] font-medium hover:bg-green-700 transition-colors flex-1 justify-center"
                >
                  Mark as Enrolled
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminEnquiries;
