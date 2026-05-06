import { Link } from "react-router-dom";
import { Heart, PackageCheck, Trash2 } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useWishlist } from "@/hooks/useWishlist";
import { formatPaiseAsRupees } from "@/lib/ecommerce";

const Wishlist = () => {
  const { items, loading, removeFromWishlist } = useWishlist();

  return (
    <AccountLayout title="My Wishlist" description="Save products for later and return to them when you are ready to purchase.">
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">Saved Products</h2>
            <p className="font-body text-sm text-muted-foreground">Wishlist items are stored under your account only.</p>
          </div>
          <Link to="/products" className="font-body text-sm font-semibold text-gold hover:text-gold-light">Browse products</Link>
        </div>

        {loading ? (
          <p className="font-body text-sm text-muted-foreground">Loading wishlist...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
            <Heart className="mx-auto mb-4 h-10 w-10 text-gold" />
            <h3 className="font-display text-xl text-foreground">No wishlist items yet</h3>
            <p className="mt-2 font-body text-sm text-muted-foreground">Use the heart button on product cards or detail pages to save items.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.productId} className="overflow-hidden rounded-xl border border-border/70 bg-background/70 shadow-sm">
                <Link to={`/products/${item.productId}`} className="block aspect-square bg-muted">
                  {item.image ? <img src={item.image} alt={item.name || "Wishlist product"} className="h-full w-full object-cover" /> : <PackageCheck className="m-auto h-10 w-10 text-gold" />}
                </Link>
                <div className="p-4">
                  <p className="font-display text-lg text-foreground line-clamp-2">{item.name || item.productId}</p>
                  <p className="mt-1 font-body text-xs text-muted-foreground">{item.categoryLabel || "Saved product"}</p>
                  <p className="mt-3 font-body font-semibold text-gold">{item.displayPrice || formatPaiseAsRupees(item.amountInPaise || 0)}</p>
                  <div className="mt-4 flex gap-2">
                    <Link to={`/products/${item.productId}`} className="flex-1 rounded-sm bg-gold px-4 py-2 text-center font-body text-sm font-semibold text-charcoal transition-colors hover:bg-gold-light">View</Link>
                    <button type="button" onClick={() => removeFromWishlist(item.productId)} className="rounded-sm border border-destructive/30 px-3 py-2 text-destructive transition-colors hover:bg-destructive/10" aria-label={`Remove ${item.name || item.productId} from wishlist`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default Wishlist;