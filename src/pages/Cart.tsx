import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SEO from "@/components/SEO";
import { useCart } from "@/contexts/cart-context";
import { calculateLineTotal, formatPaiseAsRupees } from "@/lib/ecommerce";
import heroTemple from "@/assets/hero-temple.jpg";

const Cart = () => {
  const { items, cart, loading, incrementItem, decrementItem, removeItem, clearCart } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Shopping Cart | Javani Spiritual Hub" description="Review your selected Javani Spiritual Hub products before checkout." />
      <PageHero
        backgroundImages={[heroTemple]}
        label="Shopping Cart"
        heading="Your Sacred Selections"
        subtext="Review quantities and totals before checkout."
        breadcrumb={[{ label: "Home", path: "/" }, { label: "Cart" }]}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <Link to="/products" className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold/40 bg-card px-4 py-2 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to products
        </Link>

        {loading ? (
          <div className="bg-card shadow-card rounded-xl p-8 font-body text-muted-foreground">Loading cart...</div>
        ) : items.length === 0 ? (
          <section className="bg-card shadow-card rounded-xl p-8 sm:p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gold/10 text-gold flex items-center justify-center mx-auto mb-5">
              <ShoppingBag className="w-9 h-9" />
            </div>
            <h2 className="font-display text-3xl text-foreground mb-3">Your cart is empty</h2>
            <p className="font-body text-muted-foreground max-w-xl mx-auto mb-8">
              Add products from the collection and return here to review quantities before checkout.
            </p>
            <Link to="/products" className="inline-flex items-center justify-center font-display tracking-[0.08em] px-7 py-3 bg-gold text-charcoal hover:bg-gold-light transition-colors">
              Browse Products
            </Link>
          </section>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-2xl text-foreground">Cart Items</h2>
                <button type="button" onClick={clearCart} className="font-body text-sm text-muted-foreground hover:text-destructive transition-colors">
                  Clear cart
                </button>
              </div>

              {items.map((item) => (
                <article key={item.productId} className="bg-card shadow-card rounded-xl border border-border/50 p-4 sm:p-5 grid grid-cols-[84px_1fr] sm:flex gap-4">
                  <div className="w-[84px] h-[84px] sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gold">
                        <ShoppingBag className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h3 className="font-display font-semibold text-base sm:text-lg text-foreground line-clamp-2">{item.name}</h3>
                      <p className="font-body text-sm text-muted-foreground mt-1">{item.categoryLabel}</p>
                      <p className="font-body text-sm text-gold font-semibold mt-2">{item.displayPrice}</p>
                    </div>

                    <div className="flex flex-wrap sm:flex-col items-center sm:items-end justify-between gap-3">
                      <div className="flex items-center border border-border rounded-md overflow-hidden">
                        <button type="button" onClick={() => decrementItem(item.productId)} disabled={item.quantity <= 1} className="w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40" aria-label={`Decrease ${item.name} quantity`}>
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center font-body font-semibold">{item.quantity}</span>
                        <button type="button" onClick={() => incrementItem(item.productId)} className="w-9 h-9 flex items-center justify-center hover:bg-muted transition-colors" aria-label={`Increase ${item.name} quantity`}>
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-body font-semibold text-foreground">{formatPaiseAsRupees(calculateLineTotal(item.amountInPaise, item.quantity))}</span>
                        <button type="button" onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label={`Remove ${item.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="bg-card shadow-card rounded-xl border border-border/50 p-6 h-fit lg:sticky lg:top-28">
              <h2 className="font-display text-2xl text-foreground mb-5">Order Summary</h2>
              <div className="space-y-3 font-body text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span className="text-foreground font-medium">{cart.totals.totalItems}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium">{formatPaiseAsRupees(cart.totals.subtotalInPaise)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-muted-foreground">Calculated later</span>
                </div>
                <div className="border-t border-border pt-4 mt-4 flex items-center justify-between text-base">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-gold">{formatPaiseAsRupees(cart.totals.totalInPaise)}</span>
                </div>
              </div>

              <Link to="/checkout" className="block w-full mt-6 text-center font-display tracking-[0.08em] px-5 py-3 bg-gradient-primary text-primary-foreground shadow-[0_10px_24px_rgba(139,26,26,0.2)] transition-all hover:brightness-110">
                Proceed to Checkout
              </Link>
              <Link to="/products" className="block text-center mt-3 font-body text-sm text-gold hover:text-gold-light transition-colors">
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Cart;