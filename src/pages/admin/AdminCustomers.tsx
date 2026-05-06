import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ChevronRight, Mail, PackageCheck, Phone, Search, UserRound } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatAccountDate, formatPaiseAsRupees, normalizeCustomerOrder, normalizeCustomerProfile, sortOrdersNewestFirst, type CustomerProfile, type Order } from "@/lib/ecommerce";

const AdminCustomers = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeCustomers = onSnapshot(collection(db, "users"), (snapshot) => {
      const nextCustomers = snapshot.docs
        .map((customerDoc) => normalizeCustomerProfile(customerDoc.id, customerDoc.data()))
        .filter((customer) => customer.role !== "admin")
        .sort((firstCustomer, secondCustomer) => firstCustomer.username.localeCompare(secondCustomer.username));
      setCustomers(nextCustomers);
      setSelectedCustomerId((currentId) => currentId || nextCustomers[0]?.uid || null);
      setLoading(false);
    }, (error) => {
      console.error("Unable to load customers", error);
      setLoading(false);
    });

    const unsubscribeOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      setOrders(sortOrdersNewestFirst(snapshot.docs.map((orderDoc) => normalizeCustomerOrder(orderDoc.id, orderDoc.data()))));
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeOrders();
    };
  }, []);

  const customerStats = useMemo(() => new Map(customers.map((customer) => {
    const customerOrders = orders.filter((order) => order.customerId === customer.uid);
    const totalSpendInPaise = customerOrders.reduce((total, order) => total + Math.max(0, order.totalInPaise || 0), 0);
    return [customer.uid, { orderCount: customerOrders.length, totalSpendInPaise, orders: customerOrders }] as const;
  })), [customers, orders]);

  const filteredCustomers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText) return customers;

    return customers.filter((customer) => [customer.username, customer.email, customer.phone, customer.whatsappNumber, customer.callNumber, customer.uid].filter(Boolean).join(" ").toLowerCase().includes(queryText));
  }, [customers, search]);

  const selectedCustomer = useMemo(() => customers.find((customer) => customer.uid === selectedCustomerId) || null, [customers, selectedCustomerId]);
  const selectedStats = selectedCustomer ? customerStats.get(selectedCustomer.uid) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">E-Commerce</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Customer Management</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Review customer profiles and connected order history.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5">
          <UserRound className="mb-3 h-5 w-5 text-gold" />
          <p className="font-display text-3xl text-foreground">{customers.length}</p>
          <p className="font-body text-xs font-medium text-muted-foreground sm:text-sm">Customers</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5">
          <PackageCheck className="mb-3 h-5 w-5 text-gold" />
          <p className="font-display text-3xl text-foreground">{orders.length}</p>
          <p className="font-body text-xs font-medium text-muted-foreground sm:text-sm">Customer Orders</p>
        </div>
        <div className="col-span-2 rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5 xl:col-span-2">
          <p className="font-body text-sm text-muted-foreground">Total customer order value</p>
          <p className="mt-2 font-display text-3xl text-gold">{formatPaiseAsRupees(orders.reduce((total, order) => total + Math.max(0, order.totalInPaise || 0), 0))}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
          <label className="relative mb-4 block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Search customers" />
          </label>

          {loading ? (
            <p className="font-body text-sm text-muted-foreground">Loading customers...</p>
          ) : filteredCustomers.length === 0 ? (
            <div className="rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
              <UserRound className="mx-auto mb-3 h-9 w-9 text-gold" />
              <p className="font-display text-xl text-foreground">No customers found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((customer) => {
                const stats = customerStats.get(customer.uid);
                return (
                  <button key={customer.uid} type="button" onClick={() => setSelectedCustomerId(customer.uid)} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedCustomerId === customer.uid ? "border-gold bg-gold/10" : "border-border/70 bg-background/70 hover:border-gold/40"}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-display text-lg text-foreground">{customer.username}</p>
                        <p className="mt-1 truncate font-body text-sm text-muted-foreground">{customer.email || customer.uid}</p>
                        <p className="mt-1 font-body text-xs text-muted-foreground">{stats?.orderCount || 0} orders · {formatPaiseAsRupees(stats?.totalSpendInPaise || 0)}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5 xl:sticky xl:top-24 xl:h-fit">
          {!selectedCustomer ? (
            <div className="py-10 text-center">
              <UserRound className="mx-auto mb-3 h-9 w-9 text-gold" />
              <p className="font-display text-xl text-foreground">Select a customer</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">Profile and purchase history appear here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Customer Detail</p>
                <h2 className="mt-1 font-display text-2xl text-foreground">{selectedCustomer.username}</h2>
                <p className="mt-1 font-body text-xs text-muted-foreground break-all">{selectedCustomer.uid}</p>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/70 bg-background/70 p-4 font-body text-sm">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold" />{selectedCustomer.email || "No email"}</div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold" />WhatsApp: {selectedCustomer.whatsappNumber || selectedCustomer.phone || "Not saved"}</div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold" />Call: {selectedCustomer.callNumber || selectedCustomer.phone || "Not saved"}</div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-lg bg-card p-3"><p className="font-display text-2xl text-foreground">{selectedStats?.orderCount || 0}</p><p className="text-xs text-muted-foreground">Orders</p></div>
                  <div className="rounded-lg bg-card p-3"><p className="font-display text-lg text-gold">{formatPaiseAsRupees(selectedStats?.totalSpendInPaise || 0)}</p><p className="text-xs text-muted-foreground">Spend</p></div>
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg text-foreground">Purchase History</h3>
                <div className="mt-3 space-y-2">
                  {selectedStats?.orders.length ? selectedStats.orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-base text-foreground">{order.orderNumber || order.id}</p>
                          <p className="mt-1 font-body text-xs text-muted-foreground">{formatAccountDate(order.createdAt)} · {order.status}</p>
                        </div>
                        <p className="font-body text-sm font-semibold text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="rounded-lg border border-gold/15 bg-background/70 p-4 font-body text-sm text-muted-foreground">No orders connected to this customer yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AdminCustomers;