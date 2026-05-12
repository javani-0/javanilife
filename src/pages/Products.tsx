import { useState, useEffect, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLocation, useNavigate } from "react-router-dom";

import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import SectionLabel from "@/components/SectionLabel";
import SEO from "@/components/SEO";
import ShareButton from "@/components/ShareButton";
import { useCart } from "@/contexts/cart-context";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import {
  getProductDisplayPrice,
  getActiveCategories,
  isProductActive,
  isProductPurchasable,
  normalizeProduct,
  normalizeProductStockStatus,
  type Product,
  type ProductCategoryFilter,
  type ProductStockStatus,
} from "@/lib/ecommerce";
import { useProductCategories } from "@/hooks/useManagedCategories";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Heart,
  Clock,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import heroDancer1 from "@/assets/hero-dancer-1.jpg";
import heroTemple from "@/assets/hero-temple.jpg";
import carnaticMusic from "@/assets/carnatic-music.jpg";

type SortMode = "featured" | "price-asc" | "price-desc" | "name";

interface StockMeta {
  label: string;
  className: string;
  Icon: LucideIcon;
}

const sortOptions: { label: string; value: SortMode }[] = [
  { label: "Featured", value: "featured" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Name", value: "name" },
];

const categoryBadgeColors: Record<string, string> = {
  clothing: "bg-primary text-primary-foreground",
  "thermic-toys": "bg-gold text-gold-foreground",
  aaharya: "bg-charcoal text-charcoal-foreground",
  accessories: "bg-primary-light text-primary-foreground",
  "books-stationaries": "bg-muted text-foreground",
  "sattvic-refreshments": "bg-green-100 text-green-700",
};

const stockMetaByStatus: Record<ProductStockStatus, StockMeta> = {
  available: {
    label: "In stock",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
  },
  "out-of-stock": {
    label: "Out of stock",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
    Icon: AlertCircle,
  },
  "coming-soon": {
    label: "Coming soon",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: Clock,
  },
};

const fieldControlClass = "h-10 sm:h-12 w-full rounded-md border border-gold/20 bg-card px-4 font-body text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-gold focus:ring-2 focus:ring-gold/20";

const SkeletonCard = () => (
  <div className="overflow-hidden rounded-lg border border-gold/10 bg-card shadow-card">
    <div className="aspect-square skeleton-shimmer" />
    <div className="p-4 sm:p-5 space-y-3">
      <div className="h-4 w-3/4 skeleton-shimmer rounded" />
      <div className="h-4 w-1/2 skeleton-shimmer rounded" />
      <div className="h-10 w-full skeleton-shimmer rounded" />
    </div>
  </div>
);

const getStockMeta = (product: Product): StockMeta => {
  const stockStatus = normalizeProductStockStatus(product.stockStatus);
  const stockQuantity = typeof product.stockQuantity === "number" ? product.stockQuantity : undefined;

  if (stockStatus === "available" && typeof stockQuantity === "number") {
    if (stockQuantity <= 0) return stockMetaByStatus["out-of-stock"];
    if (stockQuantity <= 3) {
      return {
        label: `Only ${stockQuantity} left`,
        className: "border-amber-200 bg-amber-50 text-amber-700",
        Icon: Clock,
      };
    }
  }

  return stockMetaByStatus[stockStatus];
};

const clampQuantity = (quantity: number, stockQuantity?: number) => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  return typeof stockQuantity === "number" && stockQuantity > 0 ? Math.min(safeQuantity, stockQuantity) : safeQuantity;
};

const ProductCard = ({
  product,
  delay = 0,
  wishlisted,
  onToggleWishlist,
}: {
  product: Product;
  delay?: number;
  wishlisted: boolean;
  onToggleWishlist: (product: Product) => Promise<"added" | "removed">;
}) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [qty, setQty] = useState(1);
  const [pendingAction, setPendingAction] = useState<"cart" | "buy-now" | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { addProduct, openCart, setBuyNowProduct } = useCart();
  const { toast } = useToast();
  const { ref, isVisible } = useScrollAnimation();

  const imageUrl = product.image || product.images?.[0] || heroTemple;
  const displayPrice = getProductDisplayPrice(product);
  const stockMeta = getStockMeta(product);
  const StockIcon = stockMeta.Icon;
  const stockQuantity = typeof product.stockQuantity === "number" ? product.stockQuantity : undefined;
  const maxQuantity = typeof stockQuantity === "number" && stockQuantity > 0 ? stockQuantity : undefined;
  const purchasable = isProductPurchasable(product);
  const canIncrease = !maxQuantity || qty < maxQuantity;
  const openProductDetail = () => navigate(`/products/${product.id}`);
  const listingCaption = product.shortDescription || product.description || "Curated by Javani Spiritual Hub for practice and performance.";

  useEffect(() => {
    setQty((quantity) => clampQuantity(quantity, stockQuantity));
  }, [stockQuantity]);

  const handleDetailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProductDetail();
    }
  };

  const decreaseQuantity = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setQty((quantity) => clampQuantity(quantity - 1, stockQuantity));
  };

  const increaseQuantity = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setQty((quantity) => clampQuantity(quantity + 1, stockQuantity));
  };

  const handleAddToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!purchasable || pendingAction) return;

    setPendingAction("cart");
    try {
      await addProduct(product, qty);
      openCart();
    } catch {
      toast({ title: "Unable to add item", description: "Please try again.", variant: "destructive" });
    } finally {
      setPendingAction(null);
    }
  };

  const handleBuyNow = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!purchasable || pendingAction) return;

    setPendingAction("buy-now");
    try {
      setBuyNowProduct(product, qty);
      await addProduct(product, qty);
      toast({ title: "Buy Now item selected", description: `${product.name} is ready for checkout.` });
      navigate("/checkout");
    } catch {
      toast({ title: "Unable to prepare checkout", description: "Please try again.", variant: "destructive" });
    } finally {
      setPendingAction(null);
    }
  };

  const handleWishlist = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      const action = await onToggleWishlist(product);
      toast({ title: action === "added" ? "Saved to wishlist" : "Removed from wishlist", description: product.name });
    } catch (error) {
      toast({ title: "Sign in required", description: error instanceof Error ? error.message : "Please sign in to use your wishlist.", variant: "destructive" });
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
    }
  };

  return (
    <article ref={ref} className={`${isVisible ? "animate-fade-up" : "opacity-0"} h-full`} style={{ animationDelay: isVisible ? `${delay}s` : undefined }}>
      <div
        role="link"
        tabIndex={0}
        onClick={openProductDetail}
        onKeyDown={handleDetailKeyDown}
        className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-gold/15 bg-card shadow-[0_10px_28px_rgba(51,35,20,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/40 hover:shadow-[0_14px_38px_rgba(51,35,20,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 lg:rounded-[1.1rem] lg:shadow-[0_18px_48px_rgba(51,35,20,0.08)] lg:hover:shadow-[0_24px_56px_rgba(51,35,20,0.14)]"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {!imgLoaded && <div className="absolute inset-0 skeleton-shimmer" />}
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-[1.035] ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
            <span className={`rounded-full px-2.5 py-1 font-body text-[0.68rem] font-semibold shadow-sm sm:text-xs ${categoryBadgeColors[product.category] || "bg-muted text-muted-foreground"}`}>
              {product.categoryLabel || product.category}
            </span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handleWishlist} className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65 ${wishlisted ? "text-gold" : ""}`} aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}>
                <Heart className={`h-4 w-4 ${wishlisted ? "fill-current" : ""}`} />
              </button>
              <ShareButton
                title={product.name}
                text={`Check out *${product.name}* on Javani Spiritual Hub — *${displayPrice}*`}
                url={`/products/${product.id}`}
                imageUrl={imageUrl}
                className="h-8 w-8 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3.5 sm:p-4.5 lg:p-5">
          <div className="text-left font-display text-[0.98rem] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[1.08rem] lg:text-[1.22rem]">
            <span className="line-clamp-2">{product.name}</span>
          </div>

          <p className="mt-2.5 line-clamp-1 font-body text-[0.92rem] leading-relaxed text-muted-foreground sm:text-sm lg:mt-3 lg:text-[1rem]">{listingCaption}</p>

          <div className="mt-4 flex items-center justify-between gap-3 lg:mt-5">
            <p className="font-body text-[1.2rem] font-bold leading-none text-primary sm:text-[1.5rem] lg:text-[1.8rem]">{displayPrice}</p>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[0.7rem] font-semibold sm:text-xs ${stockMeta.className}`}>
              <StockIcon className="h-3.5 w-3.5" /> {stockMeta.label}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 lg:mt-4 lg:px-4 lg:py-3">
            <span className="font-body text-xs font-medium text-muted-foreground">Quantity</span>
            <div className="flex items-center overflow-hidden rounded-md border border-border bg-card">
              <button type="button" onClick={decreaseQuantity} disabled={qty <= 1 || !purchasable} aria-label={`Decrease ${product.name} quantity`} className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-9 sm:w-10 text-center font-body text-sm font-semibold tabular-nums text-foreground">{qty}</span>
              <button type="button" onClick={increaseQuantity} disabled={!purchasable || !canIncrease} aria-label={`Increase ${product.name} quantity`} className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-auto pt-3 lg:pt-4">
            <div className="grid grid-cols-2 gap-2 lg:gap-3">
              <button type="button" onClick={handleAddToCart} disabled={!purchasable || pendingAction !== null} className="inline-flex h-10 sm:h-11 items-center justify-center gap-1.5 rounded-sm border border-gold bg-card px-2.5 sm:px-3 font-body text-[0.74rem] sm:text-sm font-bold text-gold transition-colors hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card disabled:hover:text-gold lg:h-12 lg:text-[0.95rem]">
                <ShoppingBag className="h-4 w-4" /> {pendingAction === "cart" ? "Adding" : "Add to Cart"}
              </button>
              <button type="button" onClick={handleBuyNow} disabled={!purchasable || pendingAction !== null} className="inline-flex h-10 sm:h-11 items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-2.5 sm:px-3 font-body text-[0.74rem] sm:text-sm font-bold text-primary-foreground shadow-[0_8px_20px_rgba(139,26,26,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 lg:h-12 lg:text-[0.95rem]">
                <Zap className="h-4 w-4" /> {pendingAction === "buy-now" ? "Ready" : "Buy Now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const Products = () => {
  const [activeFilter, setActiveFilter] = useState<ProductCategoryFilter>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { categories: productCategories } = useProductCategories();
  const filters = useMemo<{ label: string; value: ProductCategoryFilter }[]>(() => [
    { label: "All Products", value: "all" },
    ...getActiveCategories(productCategories).map((category) => ({ label: category.label, value: category.id })),
  ], [productCategories]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "products"),
      (snap) => {
        const data = snap.docs
          .map((documentSnapshot) => normalizeProduct(documentSnapshot.id, documentSnapshot.data()))
          .filter(isProductActive);
        setProducts(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("[Products] Firestore error:", err.code, err.message);
        setError(`Failed to load products: ${err.message}`);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filteredProducts = products.filter((product) => {
      const matchesCategory = activeFilter === "all" || product.category === activeFilter;
      const matchesSearch = !query || [product.name, product.description, product.categoryLabel].filter(Boolean).join(" ").toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });

    return [...filteredProducts].sort((firstProduct, secondProduct) => {
      if (sortMode === "price-asc") return (firstProduct.amountInPaise || 0) - (secondProduct.amountInPaise || 0);
      if (sortMode === "price-desc") return (secondProduct.amountInPaise || 0) - (firstProduct.amountInPaise || 0);
      if (sortMode === "name") return firstProduct.name.localeCompare(secondProduct.name);

      const featuredDifference = Number(secondProduct.featured === true) - Number(firstProduct.featured === true);
      return featuredDifference || firstProduct.name.localeCompare(secondProduct.name);
    });
  }, [activeFilter, products, searchQuery, sortMode]);

  return (
    <>
      <SEO
        title="Products & Materials | Costumes, Instruments | Javani Spiritual Hub"
        description="Shop authentic costumes, instruments, books, and practice accessories curated by Javani Spiritual Hub faculty."
      />
      <main>
        <PageHero backgroundImages={[heroDancer1, heroTemple, carnaticMusic]} label="OUR PRODUCTS" heading="Artistry Begins With the Right Tools" subtext="Authentic costumes, instruments, and learning materials curated for practice and performance." size="compact" />

        <div className="z-[500] border-y border-gold/15 bg-background py-3 sm:sticky sm:top-[80px] sm:py-4 shadow-[0_10px_30px_rgba(51,35,20,0.08)]">
          <div className="mx-auto grid max-w-7xl gap-2.5 px-4 sm:px-6 sm:gap-3 lg:grid-cols-[1fr_240px_220px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search products"
                className={`${fieldControlClass} pl-10`}
              />
            </label>
            <label className="relative block">
              <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value as ProductCategoryFilter)}
                className={`${fieldControlClass} appearance-none pl-10 pr-10`}
                aria-label="Filter products by category"
              >
                {filters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </label>
            <label className="relative block">
              <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className={`${fieldControlClass} appearance-none pl-10 pr-10`}
                aria-label="Sort products"
              >
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </label>
          </div>
        </div>

        <section className="bg-background py-12 sm:py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 xl:max-w-[1360px]">
            <div ref={headerRef} className={`${headerVisible ? "animate-fade-up" : "opacity-0"} mb-6 sm:mb-8`}>
              <SectionLabel text="CURATED FOR ARTISTS" className="mb-6" />
              <div className="flex flex-col items-center gap-3 text-center">
                <h2 className="font-display text-[1.55rem] font-semibold text-foreground sm:text-[2rem] md:text-[2.5rem]">Our Collection</h2>
                {!loading && !error && (
                  <p className="font-body text-sm text-muted-foreground">
                    <PackageCheck className="mr-1 inline h-4 w-4 text-gold" /> {visibleProducts.length} {visibleProducts.length === 1 ? "item" : "items"} ready to browse
                  </p>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7 xl:gap-8">
                {Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/20 bg-card px-6 py-12 text-center shadow-card">
                <p className="mb-2 font-display text-xl text-destructive">Unable to load products</p>
                <p className="font-body text-sm text-muted-foreground">{error}</p>
                <p className="mt-2 font-body text-xs text-muted-foreground/60">Check Firestore rules — "products" collection needs <code>allow read: if true</code></p>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="rounded-lg border border-gold/15 bg-card px-6 py-12 text-center shadow-card">
                <p className="mb-2 font-display text-xl text-muted-foreground">No products found.</p>
                <p className="font-body text-sm text-muted-foreground">Try another category or search term.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7 xl:gap-8">
                {visibleProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    delay={index * 0.06}
                    wishlisted={isWishlisted(product.id)}
                    onToggleWishlist={toggleWishlist}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <div className="hidden sm:block"><Footer /></div>
    </>
  );
};

export default Products;