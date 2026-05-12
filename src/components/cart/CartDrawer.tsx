import { Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/contexts/cart-context";
import { useAuth } from "@/contexts/AuthContext";
import { calculateLineTotal, formatPaiseAsRupees } from "@/lib/ecommerce";

const CartDrawer = () => {
  const { user } = useAuth();
  const {
    items,
    cart,
    isOpen,
    loading,
    closeCart,
    openCart,
    incrementItem,
    decrementItem,
    removeItem,
  } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? openCart() : closeCart())}>
      <SheetContent className="w-[94vw] max-w-[430px] p-0 flex flex-col bg-card">
        <SheetHeader className="px-4 sm:px-6 py-5 border-b border-border text-left">
          <SheetTitle className="font-display text-2xl text-foreground flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-gold" /> Your Cart
          </SheetTitle>
          <SheetDescription className="sr-only">
            Review cart items, update quantities, remove products, or open the full cart page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {loading ? (
            <p className="font-body text-sm text-muted-foreground">Loading cart...</p>
          ) : items.length === 0 ? (
            <div className="min-h-[260px] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gold/10 text-gold flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <h3 className="font-display text-xl text-foreground mb-2">Your cart is empty</h3>
              <p className="font-body text-sm text-muted-foreground mb-6 max-w-xs">Add a product from the collection and it will appear here for quick review.</p>
              <SheetClose asChild>
                <Link to="/products" className="font-display tracking-[0.08em] text-sm px-6 py-3 bg-gold text-charcoal hover:bg-gold-light transition-colors">
                  Browse Products
                </Link>
              </SheetClose>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.productId} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm">
                  <div className="w-[72px] h-[72px] rounded-md overflow-hidden bg-muted">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gold">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h4 className="font-display font-semibold text-sm text-foreground line-clamp-2">{item.name}</h4>
                    <p className="font-body text-xs text-muted-foreground mt-1">{item.categoryLabel}</p>
                    <p className="font-body text-sm font-semibold text-gold mt-2">
                      {formatPaiseAsRupees(calculateLineTotal(item.amountInPaise, item.quantity))}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                      <div className="flex items-center border border-border rounded-md overflow-hidden bg-card">
                        <button type="button" onClick={() => decrementItem(item.productId)} className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1}>
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-9 text-center font-body text-sm font-semibold">{item.quantity}</span>
                        <button type="button" onClick={() => incrementItem(item.productId)} className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors" aria-label={`Increase ${item.name} quantity`}>
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button type="button" onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label={`Remove ${item.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 sm:px-6 py-5 bg-background/90 space-y-4">
          <div className="flex items-center justify-between font-body">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold text-foreground">{formatPaiseAsRupees(cart.totals.subtotalInPaise)}</span>
          </div>
          <SheetClose asChild>
            <Link to="/cart" className="block text-center font-display tracking-[0.08em] px-5 py-3 border border-gold text-gold hover:bg-gold hover:text-white transition-colors">
              View Cart
            </Link>
          </SheetClose>
          {items.length > 0 && (
            <SheetClose asChild>
              <Link to="/checkout" className="block text-center font-display tracking-[0.08em] px-5 py-3 bg-gradient-primary text-primary-foreground hover:brightness-110 transition-all">
                Checkout
              </Link>
            </SheetClose>
          )}
          <p className="font-body text-xs text-muted-foreground text-center">
            {user ? "You are signed in and ready for checkout." : "Login is required before placing the order."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CartDrawer;