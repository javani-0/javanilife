import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import ImageViewer from "@/components/ImageViewer";
import ShareButton from "@/components/ShareButton";
import { useCart } from "@/contexts/cart-context";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import {
  getProductDisplayPrice,
  isProductActive,
  isProductPurchasable,
  normalizeProduct,
  normalizeProductStockStatus,
  type Product,
  type ProductStockStatus,
} from "@/lib/ecommerce";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Clock, CreditCard, Heart, Minus, Plus, ShieldCheck, ShoppingBag, Truck, Zap, type LucideIcon } from "lucide-react";
import productDetailBg from "@/assets/product-detail-bg.png";
import productDetailBgMobile from "@/assets/product-detail-bg-mobile.png";

interface StockMeta {
  label: string;
  className: string;
  Icon: LucideIcon;
}

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

const clampQuantity = (quantity: number, stockQuantity?: number) => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  return typeof stockQuantity === "number" && stockQuantity > 0 ? Math.min(safeQuantity, stockQuantity) : safeQuantity;
};

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

/* ── Mandala SVG Background Decoration ── */
const MandalaSVG = ({ className = "", flip = false }: { className?: string; flip?: boolean }) => (
  <svg
    viewBox="0 0 500 500"
    className={className}
    style={{ transform: flip ? "scaleX(-1)" : undefined }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="mandalaGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#c4553a" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#8b1a1a" stopOpacity="0.06" />
      </radialGradient>
    </defs>
    <g fill="none" stroke="url(#mandalaGrad)" strokeWidth="1.2" opacity="0.5">
      {/* Outer rings */}
      <circle cx="250" cy="250" r="240" />
      <circle cx="250" cy="250" r="220" />
      <circle cx="250" cy="250" r="195" />
      <circle cx="250" cy="250" r="170" />
      <circle cx="250" cy="250" r="140" />
      <circle cx="250" cy="250" r="110" />
      <circle cx="250" cy="250" r="80" />
      <circle cx="250" cy="250" r="50" />
      <circle cx="250" cy="250" r="25" />
      {/* Petal layers */}
      {[...Array(16)].map((_, i) => {
        const angle = (i * 360) / 16;
        return (
          <g key={i} transform={`rotate(${angle} 250 250)`}>
            <ellipse cx="250" cy="100" rx="22" ry="55" />
            <ellipse cx="250" cy="130" rx="14" ry="35" />
          </g>
        );
      })}
      {/* Inner petal ring */}
      {[...Array(12)].map((_, i) => {
        const angle = (i * 360) / 12;
        return (
          <g key={`inner-${i}`} transform={`rotate(${angle} 250 250)`}>
            <ellipse cx="250" cy="165" rx="10" ry="28" />
          </g>
        );
      })}
      {/* Spoke lines */}
      {[...Array(24)].map((_, i) => {
        const angle = ((i * 360) / 24) * (Math.PI / 180);
        const x2 = 250 + 240 * Math.cos(angle);
        const y2 = 250 + 240 * Math.sin(angle);
        return <line key={`spoke-${i}`} x1="250" y1="250" x2={x2} y2={y2} strokeWidth="0.5" />;
      })}
      {/* Decorative arcs */}
      {[...Array(8)].map((_, i) => {
        const angle = (i * 360) / 8;
        return (
          <g key={`arc-${i}`} transform={`rotate(${angle} 250 250)`}>
            <path d="M 230 60 Q 250 20 270 60" />
            <path d="M 220 75 Q 250 30 280 75" />
          </g>
        );
      })}
      {/* Center flower */}
      {[...Array(8)].map((_, i) => {
        const angle = (i * 360) / 8;
        return (
          <g key={`flower-${i}`} transform={`rotate(${angle} 250 250)`}>
            <ellipse cx="250" cy="230" rx="8" ry="18" />
          </g>
        );
      })}
    </g>
  </svg>
);


const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [pendingAction, setPendingAction] = useState<"cart" | "buy-now" | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const { addProduct, openCart, setBuyNowProduct } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { toast } = useToast();

  const allImages = product?.images || (product?.image ? [product.image] : []);
  const currentImage = allImages[selectedImage] || product?.image || "";
  const displayPrice = product ? getProductDisplayPrice(product) : "";
  const stockMeta = product ? getStockMeta(product) : stockMetaByStatus.available;
  const StockIcon = stockMeta.Icon;
  const stockQuantity = typeof product?.stockQuantity === "number" ? product.stockQuantity : undefined;
  const maxQuantity = typeof stockQuantity === "number" && stockQuantity > 0 ? stockQuantity : undefined;
  const purchasable = product ? isProductPurchasable(product) : false;
  const canIncrease = !maxQuantity || qty < maxQuantity;
  const wishlisted = product ? isWishlisted(product.id) : false;

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "products", id))
      .then((snap) => {
        if (snap.exists()) {
          const normalizedProduct = normalizeProduct(snap.id, snap.data());
          setProduct(isProductActive(normalizedProduct) ? normalizedProduct : null);
          setSelectedImage(0);
          setImgLoaded(false);
        } else {
          setProduct(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getDocs(collection(db, "products"))
      .then((snap) => {
        const all = snap.docs
          .filter((d) => d.id !== id)
          .map((productDoc) => normalizeProduct(productDoc.id, productDoc.data()))
          .filter(isProductActive);
        const sameCategory = product ? all.filter((relatedProduct) => relatedProduct.category === product.category) : [];
        const fallbackProducts = product ? all.filter((relatedProduct) => relatedProduct.category !== product.category) : all;
        setRelatedProducts([...sameCategory, ...fallbackProducts].slice(0, 4));
      })
      .catch(() => {});
  }, [id, product]);

  useEffect(() => {
    setQty((quantity) => clampQuantity(quantity, stockQuantity));
  }, [stockQuantity]);

  const decreaseQuantity = () => setQty((quantity) => clampQuantity(quantity - 1, stockQuantity));
  const increaseQuantity = () => setQty((quantity) => clampQuantity(quantity + 1, stockQuantity));

  const handleAddToCart = async () => {
    if (!product || !purchasable || pendingAction) return;

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

  const handleBuyNow = async () => {
    if (!product || !purchasable || pendingAction) return;

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

  const handleWishlist = async () => {
    if (!product) return;
    try {
      const action = await toggleWishlist(product);
      toast({ title: action === "added" ? "Saved to wishlist" : "Removed from wishlist", description: product.name });
    } catch (error) {
      toast({ title: "Sign in required", description: error instanceof Error ? error.message : "Please sign in to use your wishlist.", variant: "destructive" });
      navigate(`/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5D5BC" }}>
        <div className="w-8 h-8 border-2 border-[#8B1A1A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: "#F5D5BC" }}>
        <h1 className="font-display text-2xl text-[#3D1A0E]">Product not found</h1>
        <Link to="/products" className="text-[#8B1A1A] hover:underline font-body text-sm">← Back to Products</Link>
      </div>
    );
  }

  const features = product.features && product.features.length > 0 ? product.features : [];

  return (
    <>
      <SEO
        title={`${product.name} | Javani Spiritual Hub`}
        description={product.description}
        ogImage={currentImage}
      />

      <ImageViewer
        images={allImages}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
      />

      <main
        className="relative min-h-screen overflow-hidden pt-24 lg:pt-28"
        style={{
          background: "linear-gradient(135deg, #F8DFC8 0%, #F2C9A8 30%, #EDBE9E 60%, #F5D5BC 100%)",
        }}
      >
        {/* Desktop background image — fixed 16:9 ratio, anchored to top */}
        <div className="absolute top-0 left-0 w-full hidden lg:block pointer-events-none z-0" style={{ aspectRatio: "16/9" }}>
          <img
            src={productDetailBg}
            alt=""
            aria-hidden="true"
            className="w-full h-full"
            style={{ objectFit: "fill" }}
          />
          {/* Overlay to keep readability */}
          <div className="absolute inset-0" style={{ background: "rgba(245, 213, 188, 0.50)" }} />
        </div>

        {/* Mobile background image — full cover */}
        <div className="absolute inset-0 lg:hidden pointer-events-none z-0">
          <img
            src={productDetailBgMobile}
            alt=""
            aria-hidden="true"
            className="w-full h-full"
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
          <div className="absolute inset-0" style={{ background: "rgba(245, 213, 188, 0.45)" }} />
        </div>
        {/* Mandala Background Decorations */}
        <div className="absolute top-0 left-0 w-[420px] h-[420px] -translate-x-1/4 -translate-y-1/4 pointer-events-none z-0 hidden lg:block">
          <MandalaSVG className="w-full h-full" />
        </div>
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] translate-x-1/4 -translate-y-1/2 pointer-events-none z-0 hidden lg:block">
          <MandalaSVG className="w-full h-full" flip />
        </div>
        <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] translate-y-1/3 pointer-events-none z-0 hidden lg:block opacity-60">
          <MandalaSVG className="w-full h-full" />
        </div>

        {/* ── Breadcrumb ── */}
        <div className="relative z-10 px-4 sm:px-8 max-w-7xl mx-auto">
          <Link to="/products" className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#B58A52]/35 bg-white/55 px-4 py-2 font-body text-sm font-semibold text-[#7A1010] shadow-sm transition-colors hover:bg-white/80">
            <ArrowLeft className="h-4 w-4" /> Back to products
          </Link>
          <nav className="hidden items-center gap-1.5 font-body text-sm text-[#6B4C3B] lg:flex">
            <Link to="/" className="hover:text-[#8B1A1A] transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 text-[#A0755A]" />
            <Link to="/products" className="hover:text-[#8B1A1A] transition-colors">Products</Link>
            <ChevronRight className="w-3.5 h-3.5 text-[#A0755A]" />
            <span className="text-[#3D1A0E] font-medium truncate max-w-[280px]">
              {product.name}
            </span>
          </nav>
        </div>

        {/* ── Product Content ── */}
        <section className="relative z-10 py-6 sm:py-10 md:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-[380px_1fr] gap-8 lg:gap-14 items-start">

              {/* ── Left Column: Image Gallery ── */}
              <div className="flex flex-col gap-3 lg:max-w-[380px]">
                {/* Main Image */}
                <div
                  className="relative overflow-hidden bg-[#EDD4BE] cursor-pointer group shadow-lg"
                  style={{ borderRadius: "6px", aspectRatio: "1/1" }}
                  onClick={() => setIsViewerOpen(true)}
                >
                  {!imgLoaded && (
                    <div className="absolute inset-0 animate-pulse" style={{ background: "#E8C8AD" }} />
                  )}
                  <img
                    src={currentImage}
                    alt={product.name}
                    onLoad={() => setImgLoaded(true)}
                    className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  />
                  {/* View overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all duration-300 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 px-4 py-2 rounded-full font-body text-sm text-[#3D1A0E] font-medium shadow-lg">
                      Click to view
                    </span>
                  </div>
                </div>

                {/* Thumbnail Row */}
                {allImages.length > 1 && (
                  <div className="flex gap-3">
                    {allImages.slice(0, 4).map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setSelectedImage(idx); setImgLoaded(false); }}
                        className={`relative overflow-hidden flex-1 aspect-square transition-all duration-200 ${
                          selectedImage === idx
                            ? "ring-2 ring-[#8B1A1A] ring-offset-2 ring-offset-[#F5D5BC]"
                            : "opacity-70 hover:opacity-100"
                        }`}
                        style={{ borderRadius: "4px" }}
                      >
                        <img
                          src={img}
                          alt={`${product.name} ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Single thumbnail when only one image */}
                {allImages.length <= 1 && (
                  <div className="flex gap-3">
                    <div
                      className="relative overflow-hidden aspect-square ring-2 ring-[#8B1A1A] ring-offset-2 ring-offset-[#F5D5BC]"
                      style={{ borderRadius: "4px", background: "#E8C8AD", width: "72px" }}
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right Column: Product Info ── */}
              <div
                className="flex flex-col gap-5 lg:gap-5"
                style={{}}
              >
                {/* Mobile: frosted card for readability */}
                <div
                  className="flex flex-col gap-4 lg:contents rounded-2xl p-4 lg:p-0"
                  style={{
                    background: "rgba(255, 245, 235, 0.82)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >

                {/* Product Title + Share */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#8B1A1A] px-3 py-1 font-body text-xs font-bold text-white shadow-sm">{product.categoryLabel}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-body text-xs font-bold ${stockMeta.className}`}>
                    <StockIcon className="h-3.5 w-3.5" /> {stockMeta.label}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <h1
                    className="font-display font-bold leading-tight"
                    style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", color: "#2A0D05" }}
                  >
                    {product.name}
                  </h1>
                  <div className="mt-1 flex flex-shrink-0 items-center gap-2">
                    <button type="button" onClick={handleWishlist} className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#B58A52]/40 bg-white/70 text-[#B58A52] transition-colors hover:bg-[#B58A52] hover:text-white ${wishlisted ? "bg-[#B58A52] text-white" : ""}`} aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}>
                      <Heart className={`h-4 w-4 ${wishlisted ? "fill-current" : ""}`} />
                    </button>
                    <ShareButton
                      title={product.name}
                      text={`Check out *${product.name}* on Javani Spiritual Hub — *${displayPrice}*`}
                      url={`/products/${product.id}`}
                      imageUrl={currentImage}
                      className="flex-shrink-0"
                    />
                  </div>
                </div>

                {/* Price */}
                <p
                  className="font-body font-bold"
                  style={{ fontSize: "clamp(2rem, 5vw, 2.8rem)", color: "#2A0D05", letterSpacing: "-0.01em" }}
                >
                  {displayPrice}
                </p>

                {/* Description */}
                <p
                  className="font-body text-[0.95rem] leading-relaxed"
                  style={{ color: "#3D1800" }}
                >
                  {product.description}
                </p>

                {/* Feature Bullets */}
                {features.length > 0 && (
                  <ul className="space-y-2">
                    {features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                          style={{ background: "#3D1A0E" }}
                        />
                        <span className="font-body text-[0.9rem]" style={{ color: "#2A0D05" }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Quantity Row */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="font-body text-sm font-medium" style={{ color: "#2A0D05" }}>
                    Quantity:
                  </span>
                  <div
                    className="flex items-center overflow-hidden"
                    style={{ border: "1.5px solid #C4A882", borderRadius: "6px" }}
                  >
                    <button
                      onClick={decreaseQuantity}
                      disabled={qty <= 1 || !purchasable}
                      className="w-10 h-10 flex items-center justify-center hover:bg-[#EDD4BE] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: "#6B4C3B" }}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span
                      className="w-12 text-center font-body font-semibold text-sm py-2"
                      style={{ color: "#3D1A0E", borderLeft: "1.5px solid #C4A882", borderRight: "1.5px solid #C4A882" }}
                    >
                      {qty}
                    </span>
                    <button
                      onClick={increaseQuantity}
                      disabled={!purchasable || !canIncrease}
                      className="w-10 h-10 flex items-center justify-center hover:bg-[#EDD4BE] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: "#6B4C3B" }}
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {!purchasable && (
                  <div className="rounded-lg border border-[#8B1A1A]/15 bg-white/45 px-4 py-3 font-body text-sm font-semibold text-[#7A1010]">
                    This product is not available for purchase right now.
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!purchasable || pendingAction !== null}
                    className="flex flex-1 items-center justify-center gap-2 border border-[#B58A52] bg-white/70 px-8 py-3 font-body text-base font-bold text-[#B58A52] shadow-md transition-all hover:bg-[#B58A52] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/70 disabled:hover:text-[#B58A52]"
                  >
                    <ShoppingBag className="w-5 h-5" /> {pendingAction === "cart" ? "Adding" : "Add to Cart"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    disabled={!purchasable || pendingAction !== null}
                    className="flex flex-1 items-center justify-center gap-2 px-8 py-3 font-display text-base font-semibold tracking-wide text-white shadow-lg transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                    style={{
                      background: "linear-gradient(135deg, #9B2020 0%, #7A1010 100%)",
                      borderRadius: "0",
                      letterSpacing: "0.04em",
                    }}
                  >
                    <Zap className="w-5 h-5" /> {pendingAction === "buy-now" ? "Preparing" : "Buy Now"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1.5 sm:grid-cols-3 sm:gap-3 sm:pt-2">
                  <div className="rounded-lg border border-[#C4A882]/45 bg-white/45 p-2.5 sm:p-3">
                    <Truck className="mb-1.5 h-4 w-4 text-[#8B1A1A] sm:mb-2 sm:h-5 sm:w-5" />
                    <p className="font-body text-[11px] font-semibold leading-snug text-[#2A0D05] sm:text-xs">Delivery charges will be calculated from product weight at checkout.</p>
                  </div>
                  <div className="rounded-lg border border-[#C4A882]/45 bg-white/45 p-2.5 sm:p-3">
                    <CreditCard className="mb-1.5 h-4 w-4 text-[#8B1A1A] sm:mb-2 sm:h-5 sm:w-5" />
                    <p className="font-body text-[11px] font-semibold leading-snug text-[#2A0D05] sm:text-xs">Cash on Delivery and online payment will both be available in checkout.</p>
                  </div>
                  <div className="rounded-lg border border-[#C4A882]/45 bg-white/45 p-2.5 sm:p-3">
                    <ShieldCheck className="mb-1.5 h-4 w-4 text-[#8B1A1A] sm:mb-2 sm:h-5 sm:w-5" />
                    <p className="font-body text-[11px] font-semibold leading-snug text-[#2A0D05] sm:text-xs">Adding here saves the item to your cart immediately for the next checkout step.</p>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── You May Also Like ── */}
      {relatedProducts.length > 0 && (
        <section
          className="py-10 px-4 sm:px-8"
          style={{ background: "linear-gradient(135deg, #F8DFC8 0%, #F2C9A8 50%, #F5D5BC 100%)" }}
        >
          <div className="max-w-7xl mx-auto">
            <h2
              className="font-display font-bold mb-6"
              style={{ fontSize: "clamp(1.4rem, 2.5vw, 2rem)", color: "#2A0D05" }}
            >
              You May Also Like
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {relatedProducts.map((rp) => (
                <Link
                  key={rp.id}
                  to={`/products/${rp.id}`}
                  className="group relative flex flex-col rounded-xl overflow-hidden shadow-md hover:-translate-y-1 transition-all duration-300"
                  style={{ background: "rgba(255,255,255,0.55)" }}
                >
                  <div className="aspect-square overflow-hidden bg-[#EDD4BE] relative">
                    <img
                      src={rp.image}
                      alt={rp.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Share button overlay */}
                    <div className="absolute top-1.5 right-1.5">
                      <ShareButton
                        title={rp.name}
                        text={`Check out *${rp.name}* on Javani Spiritual Hub — *${getProductDisplayPrice(rp)}*`}
                        url={`/products/${rp.id}`}
                        imageUrl={rp.image}
                        className="bg-black/40 hover:bg-black/60 text-white hover:text-white rounded-full w-7 h-7"
                      />
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <p
                      className="font-display font-semibold text-sm leading-tight line-clamp-2"
                      style={{ color: "#2A0D05" }}
                    >
                      {rp.name}
                    </p>
                    <p
                      className="font-body font-bold text-sm"
                      style={{ color: "#8B1A1A" }}
                    >
                      {getProductDisplayPrice(rp)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
};

export default ProductDetail;
