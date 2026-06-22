import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { openSquareCropper } from "@/components/SquareImageCropper";
import CategoryManager from "@/components/admin/CategoryManager";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Banknote,
  Boxes,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatPaiseAsRupees,
  getActiveCategories,
  getCategoryLabel,
  getProductAmountInPaise,
  getProductDisplayPrice,
  normalizeDeliveryProfile,
  normalizeAllowedPaymentMethods,
  normalizeProduct,
  normalizeProductStockStatus,
  parsePriceToPaise,
  PRODUCT_CATEGORIES_SETTINGS_ID,
  PRODUCT_CATEGORY_LABELS,
  type ManagedCategoryOption,
  type Product,
  type ProductCategory,
  type ProductStockStatus,
} from "@/lib/ecommerce";
import { useProductCategories } from "@/hooks/useManagedCategories";

interface ProductFormState {
  name: string;
  sku: string;
  category: ProductCategory;
  categoryLabel: string;
  shortDescription: string;
  description: string;
  priceRupees: string;
  image: string;
  imagesText: string;
  stockStatus: ProductStockStatus;
  stockQuantity: string;
  active: boolean;
  featured: boolean;
  whatsappEnquiry: boolean;
  deliveryWeightInGrams: string;
  deliveryLengthInCm: string;
  deliveryWidthInCm: string;
  deliveryHeightInCm: string;
  freeDeliveryEligible: boolean;
  allowCod: boolean;
  allowOnline: boolean;
}

const emptyForm: ProductFormState = {
  name: "",
  sku: "",
  category: "clothing",
  categoryLabel: PRODUCT_CATEGORY_LABELS.clothing,
  shortDescription: "",
  description: "",
  priceRupees: "",
  image: "",
  imagesText: "",
  stockStatus: "available",
  stockQuantity: "1",
  active: true,
  featured: false,
  whatsappEnquiry: true,
  deliveryWeightInGrams: "500",
  deliveryLengthInCm: "",
  deliveryWidthInCm: "",
  deliveryHeightInCm: "",
  freeDeliveryEligible: false,
  allowCod: true,
  allowOnline: true,
};

const createEmptyForm = (categories: ManagedCategoryOption[]): ProductFormState => {
  const firstCategory = getActiveCategories(categories)[0] || categories[0];
  if (!firstCategory) return emptyForm;

  return {
    ...emptyForm,
    category: firstCategory.id,
    categoryLabel: firstCategory.label,
  };
};

const statusClasses: Record<ProductStockStatus, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "out-of-stock": "border-destructive/20 bg-destructive/10 text-destructive",
  "coming-soon": "border-amber-200 bg-amber-50 text-amber-700",
};

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 font-body text-[0.875rem] outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "font-body text-[0.8rem] font-semibold text-muted-foreground block mb-1.5";

const normalizeImageList = (primaryImage: string, imagesText: string) => {
  const imageUrls = [primaryImage, ...imagesText.split(/\r?\n/)]
    .map((imageUrl) => imageUrl.trim())
    .filter(Boolean);

  return Array.from(new Set(imageUrls));
};

const isValidImageUrl = (imageUrl: string) => /^https?:\/\/\S+$/i.test(imageUrl);

const getPriceInputFromProduct = (product: Product) => {
  const amountInPaise = getProductAmountInPaise(product);
  return amountInPaise > 0 ? String(amountInPaise / 100) : "";
};

const getStockQuantity = (product: Product) => (
  typeof product.stockQuantity === "number" && Number.isFinite(product.stockQuantity)
    ? String(Math.max(0, Math.floor(product.stockQuantity)))
    : "1"
);

const getPositiveIntegerInput = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : ""
);

const parseOptionalPositiveInteger = (value: string) => {
  if (!value.trim()) return undefined;
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const getInventoryLabel = (product: Product) => {
  const stockStatus = normalizeProductStockStatus(product.stockStatus);
  const stockQuantity = typeof product.stockQuantity === "number" ? product.stockQuantity : undefined;

  if (product.active === false) return "Hidden";
  if (stockStatus === "coming-soon") return "Coming soon";
  if (stockStatus === "out-of-stock" || stockQuantity === 0) return "Out of stock";
  if (typeof stockQuantity === "number" && stockQuantity <= 3) return `Low stock: ${stockQuantity}`;
  return typeof stockQuantity === "number" ? `In stock: ${stockQuantity}` : "In stock";
};

const getInventoryClass = (product: Product) => {
  const stockStatus = normalizeProductStockStatus(product.stockStatus);
  const stockQuantity = typeof product.stockQuantity === "number" ? product.stockQuantity : undefined;

  if (product.active === false) return "border-slate-200 bg-slate-100 text-slate-600";
  if (stockStatus === "out-of-stock" || stockQuantity === 0) return statusClasses["out-of-stock"];
  if (stockStatus === "coming-soon" || (typeof stockQuantity === "number" && stockQuantity <= 3)) return statusClasses["coming-soon"];
  return statusClasses.available;
};

const getPaymentLabel = (product: Product) => {
  const methods = normalizeAllowedPaymentMethods(product.allowedPaymentMethods);
  if (methods.includes("cod") && methods.includes("razorpay")) return "COD + Online";
  if (methods.includes("cod")) return "COD only";
  if (methods.includes("razorpay")) return "Online only";
  return "Not configured";
};

const validateProductForm = (form: ProductFormState) => {
  const amountInPaise = parsePriceToPaise(form.priceRupees);
  const stockQuantity = Number(form.stockQuantity);
  const images = normalizeImageList(form.image, form.imagesText);

  if (!form.name.trim()) return "Product name is required.";
  if (!amountInPaise || amountInPaise <= 0) return "Enter a valid numeric price greater than 0.";
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return "Stock quantity must be a whole number starting from 0.";
  if (form.stockStatus === "available" && stockQuantity <= 0) return "Available products need stock quantity greater than 0.";
  if (!form.allowCod && !form.allowOnline) return "Select at least one payment method for this product.";
  if (parseOptionalPositiveInteger(form.deliveryWeightInGrams) === null) return "Shipment weight must be a positive whole number in grams.";
  if (parseOptionalPositiveInteger(form.deliveryLengthInCm) === null) return "Shipment length must be a positive whole number in cm.";
  if (parseOptionalPositiveInteger(form.deliveryWidthInCm) === null) return "Shipment width must be a positive whole number in cm.";
  if (parseOptionalPositiveInteger(form.deliveryHeightInCm) === null) return "Shipment height must be a positive whole number in cm.";
  if (images.length === 0) return "Add at least one product image URL or upload an image.";
  if (images.some((imageUrl) => !isValidImageUrl(imageUrl))) return "Every image must be a valid http or https URL.";
  return null;
};

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [imageUploading, setImageUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { categories: productCategories } = useProductCategories();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
      const nextProducts = snapshot.docs
        .map((productDocument) => normalizeProduct(productDocument.id, productDocument.data()))
        .sort((firstProduct, secondProduct) => firstProduct.name.localeCompare(secondProduct.name));
      setProducts(nextProducts);
    });

    return unsubscribe;
  }, []);

  const inventoryStats = useMemo(() => {
    const hidden = products.filter((product) => product.active === false).length;
    const featured = products.filter((product) => product.featured === true).length;
    const outOfStock = products.filter((product) => normalizeProductStockStatus(product.stockStatus) === "out-of-stock" || product.stockQuantity === 0).length;
    const lowStock = products.filter((product) => product.active !== false && normalizeProductStockStatus(product.stockStatus) === "available" && typeof product.stockQuantity === "number" && product.stockQuantity > 0 && product.stockQuantity <= 3).length;

    return {
      total: products.length,
      active: products.length - hidden,
      hidden,
      featured,
      outOfStock,
      lowStock,
    };
  }, [products]);

  const activeProductCategories = useMemo(() => getActiveCategories(productCategories), [productCategories]);
  const productCategoryUsage = useMemo(() => products.reduce<Record<string, number>>((usage, product) => {
    usage[product.category] = (usage[product.category] || 0) + 1;
    return usage;
  }, {}), [products]);
  const categoryOptionsForForm = useMemo(() => {
    if (activeProductCategories.some((category) => category.id === form.category)) return activeProductCategories;
    const currentCategory = productCategories.find((category) => category.id === form.category);
    return currentCategory ? [...activeProductCategories, currentCategory] : activeProductCategories;
  }, [activeProductCategories, form.category, productCategories]);

  const pricePreviewInPaise = parsePriceToPaise(form.priceRupees);
  const pricePreview = pricePreviewInPaise ? formatPaiseAsRupees(pricePreviewInPaise, { includeSuffix: true }) : "Enter price";

  const openAdd = () => {
    setForm(createEmptyForm(productCategories));
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    const images = product.images?.length ? product.images : product.image ? [product.image] : [];
    const allowedPaymentMethods = normalizeAllowedPaymentMethods(product.allowedPaymentMethods);

    setForm({
      name: product.name,
      sku: product.sku || "",
      category: product.category,
      categoryLabel: product.categoryLabel || getCategoryLabel(productCategories, product.category, product.category),
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      priceRupees: getPriceInputFromProduct(product),
      image: product.image || images[0] || "",
      imagesText: images.join("\n"),
      stockStatus: normalizeProductStockStatus(product.stockStatus),
      stockQuantity: getStockQuantity(product),
      active: product.active !== false,
      featured: product.featured === true,
      whatsappEnquiry: product.whatsappEnquiry !== false,
      deliveryWeightInGrams: getPositiveIntegerInput(product.delivery?.weightInGrams) || "500",
      deliveryLengthInCm: getPositiveIntegerInput(product.delivery?.lengthInCm),
      deliveryWidthInCm: getPositiveIntegerInput(product.delivery?.widthInCm),
      deliveryHeightInCm: getPositiveIntegerInput(product.delivery?.heightInCm),
      freeDeliveryEligible: product.delivery?.freeDeliveryEligible === true,
      allowCod: allowedPaymentMethods.includes("cod"),
      allowOnline: allowedPaymentMethods.includes("razorpay"),
    });
    setEditing(product.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(createEmptyForm(productCategories));
  };

  const saveProductCategories = async (categories: ManagedCategoryOption[]) => {
    await setDoc(doc(db, "siteSettings", PRODUCT_CATEGORIES_SETTINGS_ID), {
      items: categories,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const uploadImage = async (file: File) => {
    setImageUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");

      const uploadResult = await response.json() as { secure_url?: string };
      if (!uploadResult.secure_url) throw new Error("No URL returned");

      setForm((currentForm) => {
        const images = normalizeImageList(currentForm.image || uploadResult.secure_url || "", currentForm.imagesText);
        const mergedImages = Array.from(new Set([uploadResult.secure_url!, ...images]));

        return {
          ...currentForm,
          image: currentForm.image || uploadResult.secure_url!,
          imagesText: mergedImages.join("\n"),
        };
      });
      toast({ title: "Image uploaded", description: "The image was added to this product gallery." });
    } catch (error) {
      console.error("Image upload failed", error);
      toast({ title: "Image upload failed", description: "Check Cloudinary preset settings.", variant: "destructive" });
    } finally {
      setImageUploading(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  const handleSave = async () => {
    const validationError = validateProductForm(form);
    if (validationError) {
      toast({ title: "Invalid product", description: validationError, variant: "destructive" });
      return;
    }

    const amountInPaise = parsePriceToPaise(form.priceRupees) || 0;
    const displayPrice = formatPaiseAsRupees(amountInPaise, { includeSuffix: true });
    const stockQuantity = Math.max(0, Math.floor(Number(form.stockQuantity)));
    const images = normalizeImageList(form.image, form.imagesText);
    const primaryImage = form.image.trim() || images[0];
    const stockStatus = form.stockStatus;
    const deliveryRaw = normalizeDeliveryProfile({
      weightInGrams: parseOptionalPositiveInteger(form.deliveryWeightInGrams) || undefined,
      lengthInCm: parseOptionalPositiveInteger(form.deliveryLengthInCm) || undefined,
      widthInCm: parseOptionalPositiveInteger(form.deliveryWidthInCm) || undefined,
      heightInCm: parseOptionalPositiveInteger(form.deliveryHeightInCm) || undefined,
      freeDeliveryEligible: form.freeDeliveryEligible,
    });
    // Firestore rejects undefined values — strip any keys that are undefined
    const delivery = Object.fromEntries(Object.entries(deliveryRaw).filter(([, v]) => v !== undefined));

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      categoryLabel: getCategoryLabel(productCategories, form.category, form.categoryLabel || form.category),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      price: displayPrice,
      displayPrice,
      amountInPaise,
      image: primaryImage,
      images,
      stockStatus,
      stockQuantity,
      active: form.active,
      featured: form.featured,
      whatsappEnquiry: form.whatsappEnquiry,
      allowedPaymentMethods: [form.allowCod ? "cod" : null, form.allowOnline ? "razorpay" : null].filter(Boolean),
      delivery,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editing) {
        await updateDoc(doc(db, "products", editing), payload);
        toast({ title: "Product updated", description: `${payload.name} inventory data is saved.` });
      } else {
        await addDoc(collection(db, "products"), { ...payload, createdAt: serverTimestamp() });
        toast({ title: "Product added", description: `${payload.name} is ready for inventory control.` });
      }
      closeModal();
    } catch (error) {
      console.error("Error saving product:", error);
      toast({ title: "Error saving product", description: "Check admin permissions and try again.", variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, "products", deleteTarget));
      toast({ title: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      toast({ title: "Failed to delete product", description: "Please check permissions and try again", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Inventory</p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Products Manager</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Manage product pricing, stock, visibility, featured products, and image galleries.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button type="button" onClick={() => setViewMode("grid")} className={`p-2.5 ${viewMode === "grid" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode("table")} className={`p-2.5 ${viewMode === "table" ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`} aria-label="Table view"><List className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={openAdd} className="flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2.5 font-body text-[0.85rem] font-medium text-primary-foreground hover:brightness-110">
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {[
          { label: "Total", value: inventoryStats.total, Icon: Boxes },
          { label: "Active", value: inventoryStats.active, Icon: Eye },
          { label: "Hidden", value: inventoryStats.hidden, Icon: EyeOff },
          { label: "Featured", value: inventoryStats.featured, Icon: Sparkles },
          { label: "Low Stock", value: inventoryStats.lowStock, Icon: AlertTriangle },
          { label: "Out", value: inventoryStats.outOfStock, Icon: X },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-gold/15 bg-card p-4 shadow-card">
            <Icon className="mb-2 h-4 w-4 text-gold" />
            <p className="font-display text-2xl text-foreground">{value}</p>
            <p className="font-body text-xs font-medium text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <CategoryManager
        title="Product Categories"
        description="Add, rename, hide, or delete product categories. Deleting is blocked while products still use that category."
        categories={productCategories}
        usageCounts={productCategoryUsage}
        mode="product"
        onSave={saveProductCategories}
      />

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const imageUrl = product.image || product.images?.[0];

            return (
              <article key={product.id} className="overflow-hidden rounded-lg border border-gold/10 bg-card shadow-card transition-shadow hover:shadow-hero">
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {imageUrl ? (
                    <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gold"><ImagePlus className="h-8 w-8" /></div>
                  )}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    {product.featured && <span className="rounded-full bg-gold px-2.5 py-1 font-body text-[0.65rem] font-bold text-charcoal">Featured</span>}
                    {product.active === false && <span className="rounded-full bg-slate-800/80 px-2.5 py-1 font-body text-[0.65rem] font-bold text-white">Hidden</span>}
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="font-body text-[0.75rem] text-muted-foreground">{product.categoryLabel}</span>
                    <span className={`rounded-full border px-2 py-1 font-body text-[0.7rem] font-semibold ${getInventoryClass(product)}`}>{getInventoryLabel(product)}</span>
                  </div>
                  <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-body text-[0.72rem] font-semibold text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5 text-gold" /> {getPaymentLabel(product)}
                  </p>
                  <h4 className="mb-1 font-display text-[1.05rem] font-semibold text-foreground">{product.name}</h4>
                  <p className="mb-3 font-body text-[0.8rem] text-muted-foreground line-clamp-1">{product.shortDescription || product.description || "No product caption yet."}</p>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-[1.2rem] font-bold text-primary">{getProductDisplayPrice(product)}</p>
                      {product.sku && <p className="mt-0.5 font-body text-[0.72rem] text-muted-foreground">SKU: {product.sku}</p>}
                    </div>
                    <p className="font-body text-[0.72rem] text-muted-foreground">{product.images?.length || (product.image ? 1 : 0)} images</p>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
                    <button type="button" onClick={() => openEdit(product)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-gold" aria-label={`Edit ${product.name}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setDeleteTarget(product.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${product.name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Product", "Category", "Price", "Inventory", "Payments", "Visibility", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-body text-[0.75rem] font-medium uppercase tracking-wider text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-body text-[0.875rem] font-medium text-foreground">{product.name}</p>
                      {product.sku && <p className="font-body text-[0.72rem] text-muted-foreground">{product.sku}</p>}
                    </td>
                    <td className="px-4 py-3 font-body text-[0.8rem] text-muted-foreground">{product.categoryLabel}</td>
                    <td className="px-4 py-3 font-display text-[1rem] font-bold text-primary">{getProductDisplayPrice(product)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 font-body text-[0.75rem] ${getInventoryClass(product)}`}>{getInventoryLabel(product)}</span></td>
                    <td className="px-4 py-3 font-body text-[0.8rem] text-muted-foreground">{getPaymentLabel(product)}</td>
                    <td className="px-4 py-3 font-body text-[0.8rem] text-muted-foreground">{product.active === false ? "Hidden" : "Public"}{product.featured ? " / Featured" : ""}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(product)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-gold" aria-label={`Edit ${product.name}`}><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeleteTarget(product.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${product.name}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-5 shadow-hero sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Product Inventory</p>
                <h3 className="mt-1 font-display text-[1.45rem] font-semibold text-foreground">{editing ? "Edit Product" : "Add New Product"}</h3>
              </div>
              <button type="button" onClick={closeModal} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close product form"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Product Name *</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>SKU</label>
                <input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className={inputClass} placeholder="Optional internal SKU" />
              </div>

              <div>
                <label className={labelClass}>Category</label>
                <select
                  value={form.category}
                  onChange={(event) => {
                    const category = event.target.value as ProductCategory;
                    setForm({ ...form, category, categoryLabel: getCategoryLabel(productCategories, category, category) });
                  }}
                  className={inputClass}
                >
                  {categoryOptionsForForm.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>Numeric Price *</label>
                <div className="relative">
                  <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={form.priceRupees} onChange={(event) => setForm({ ...form, priceRupees: event.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="1200" />
                </div>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Preview: <span className="font-semibold text-gold">{pricePreview}</span></p>
              </div>

              <div>
                <label className={labelClass}>Stock Quantity *</label>
                <input value={form.stockQuantity} onChange={(event) => setForm({ ...form, stockQuantity: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="0" />
              </div>

              <div>
                <label className={labelClass}>Stock Status</label>
                <select value={form.stockStatus} onChange={(event) => setForm({ ...form, stockStatus: event.target.value as ProductStockStatus })} className={inputClass}>
                  <option value="available">Available</option>
                  <option value="out-of-stock">Out of Stock</option>
                  <option value="coming-soon">Coming Soon</option>
                </select>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 font-body text-sm font-semibold text-foreground">
                  <span className="flex items-center gap-2"><Eye className="h-4 w-4 text-gold" /> Publicly visible</span>
                  <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                </label>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Hidden products do not appear on public listing/detail pages.</p>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 font-body text-sm font-semibold text-foreground">
                  <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" /> Featured product</span>
                  <input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} />
                </label>
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Featured products appear first in public product sorting.</p>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-gold/20 bg-background/70 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gold" />
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">Payment Availability</p>
                    <p className="font-body text-[0.72rem] text-muted-foreground">Choose which checkout payment methods are allowed for this product.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 font-body text-sm font-semibold text-foreground">
                    <span className="flex items-center gap-2"><Banknote className="h-4 w-4 text-gold" /> Cash on delivery</span>
                    <input type="checkbox" checked={form.allowCod} onChange={(event) => setForm({ ...form, allowCod: event.target.checked })} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 font-body text-sm font-semibold text-foreground">
                    <span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-gold" /> Online payment</span>
                    <input type="checkbox" checked={form.allowOnline} onChange={(event) => setForm({ ...form, allowOnline: event.target.checked })} />
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-gold/20 bg-background/70 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gold" />
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">Shipment & Delivery One</p>
                    <p className="font-body text-[0.72rem] text-muted-foreground">Used for checkout delivery charge and future Delivery One order payloads.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelClass}>Weight (g)</label>
                    <input value={form.deliveryWeightInGrams} onChange={(event) => setForm({ ...form, deliveryWeightInGrams: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="500" />
                  </div>
                  <div>
                    <label className={labelClass}>Length (cm)</label>
                    <input value={form.deliveryLengthInCm} onChange={(event) => setForm({ ...form, deliveryLengthInCm: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="Optional" />
                  </div>
                  <div>
                    <label className={labelClass}>Width (cm)</label>
                    <input value={form.deliveryWidthInCm} onChange={(event) => setForm({ ...form, deliveryWidthInCm: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="Optional" />
                  </div>
                  <div>
                    <label className={labelClass}>Height (cm)</label>
                    <input value={form.deliveryHeightInCm} onChange={(event) => setForm({ ...form, deliveryHeightInCm: event.target.value.replace(/[^0-9]/g, "") })} className={inputClass} inputMode="numeric" placeholder="Optional" />
                  </div>
                </div>
                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 font-body text-sm font-semibold text-foreground">
                  <span className="flex items-center gap-2"><Ruler className="h-4 w-4 text-gold" /> Free delivery eligible</span>
                  <input type="checkbox" checked={form.freeDeliveryEligible} onChange={(event) => setForm({ ...form, freeDeliveryEligible: event.target.checked })} />
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Listing Caption</label>
                <input value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} maxLength={100} className={inputClass} placeholder="One short line for product cards" />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Full Description</label>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className={inputClass} />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Primary Image URL *</label>
                {form.image && <img src={form.image} alt="Preview" className="mb-2 aspect-square w-full max-w-xs rounded-md object-cover" />}
                <input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} className={inputClass} placeholder="https://..." />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => imageRef.current?.click()} disabled={imageUploading} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 font-body text-[0.85rem] text-foreground hover:bg-muted disabled:opacity-50">
                    <Upload className="h-4 w-4" /> {imageUploading ? "Uploading..." : "Upload Image"}
                  </button>
                  <input
                    ref={imageRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      // Enforce 1:1 — crop to square before uploading.
                      const square = await openSquareCropper(file);
                      if (square) void uploadImage(square);
                    }}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Gallery Images</label>
                <textarea value={form.imagesText} onChange={(event) => setForm({ ...form, imagesText: event.target.value })} rows={4} className={inputClass} placeholder="One image URL per line" />
                <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Use one image URL per line. The product detail page uses this gallery.</p>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-gold/20 bg-gold/10 p-4 font-body text-sm text-foreground">
                <CheckCircle2 className="mr-2 inline h-4 w-4 text-gold" />
                Saving writes amountInPaise, displayPrice, inventory, image gallery, and shipment fields together.
              </div>

              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} className="rounded-md border border-border px-5 py-2.5 font-body text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleSave} className="rounded-md bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
                  {editing ? "Update Product" : "Add Product"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProducts;
