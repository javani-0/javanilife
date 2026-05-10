import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { CartContext, type CartContextType } from "@/contexts/cart-context";
import { db } from "@/lib/firebase";
import {
  BUY_NOW_STORAGE_KEY,
  CART_STORAGE_KEY,
  clampCartQuantity,
  createCart,
  createCartItemFromProduct,
  isProductCategory,
  isProductPurchasable,
  mergeCartItems,
  normalizeProductStockStatus,
  PRODUCT_CATEGORY_LABELS,
  removeCartItem,
  setCartItemQuantity,
  type CartItem,
  type Product,
  type ProductCategory,
} from "@/lib/ecommerce";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const AUTH_CART_PENDING_STORAGE_KEY = `${CART_STORAGE_KEY}.auth-pending`;

const normalizeStoredCartItem = (value: unknown, fallbackProductId?: string): CartItem | null => {
  if (!isRecord(value)) return null;

  const productId = typeof value.productId === "string" ? value.productId : fallbackProductId;
  const sourceId = typeof value.sourceId === "string" ? value.sourceId : productId;
  const itemType = value.itemType === "course" ? "course" : "product";
  const name = typeof value.name === "string" ? value.name : null;
  const rawCategory = value.category;
  const category: ProductCategory = isProductCategory(rawCategory) ? rawCategory : itemType === "course" ? "course" : "clothing";
  const quantity = typeof value.quantity === "number" ? value.quantity : 1;
  const amountInPaise = typeof value.amountInPaise === "number" ? value.amountInPaise : 0;

  if (!productId || !name) return null;

  return {
    productId,
    sourceId,
    itemType,
    name,
    category,
    categoryLabel: typeof value.categoryLabel === "string" ? value.categoryLabel : PRODUCT_CATEGORY_LABELS[category] || category,
    image: typeof value.image === "string" ? value.image : undefined,
    quantity: clampCartQuantity(quantity, typeof value.maxQuantity === "number" ? value.maxQuantity : undefined),
    amountInPaise: Math.max(0, Math.round(amountInPaise)),
    displayPrice: typeof value.displayPrice === "string" ? value.displayPrice : "₹0",
    stockStatus: normalizeProductStockStatus(typeof value.stockStatus === "string" ? value.stockStatus : undefined),
    maxQuantity: typeof value.maxQuantity === "number" ? value.maxQuantity : undefined,
    addedAt: value.addedAt,
    updatedAt: value.updatedAt,
  };
};

const readStoredItemsOrNull = (storageKey: string): CartItem[] | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (rawValue === null) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return null;

    return parsedValue
      .map((item) => normalizeStoredCartItem(item))
      .filter((item): item is CartItem => item !== null);
  } catch (error) {
    console.error("Unable to read stored cart", error);
    return null;
  }
};

const readStoredItems = (storageKey: string): CartItem[] => readStoredItemsOrNull(storageKey) ?? [];

const writeStoredItems = (storageKey: string, items: CartItem[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(items));
};

const removeStoredItems = (storageKey: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
};

const readPendingAuthItems = (): CartItem[] | null => readStoredItemsOrNull(AUTH_CART_PENDING_STORAGE_KEY);

const writePendingAuthItems = (items: CartItem[]) => writeStoredItems(AUTH_CART_PENDING_STORAGE_KEY, items);

const clearPendingAuthItems = () => removeStoredItems(AUTH_CART_PENDING_STORAGE_KEY);

const cartItemsMatch = (firstItems: CartItem[], secondItems: CartItem[]): boolean => {
  if (firstItems.length !== secondItems.length) return false;

  const secondItemsByProductId = new Map(secondItems.map((item) => [item.productId, item]));

  return firstItems.every((firstItem) => {
    const secondItem = secondItemsByProductId.get(firstItem.productId);
    return Boolean(secondItem)
      && firstItem.quantity === secondItem.quantity
      && firstItem.amountInPaise === secondItem.amountInPaise
      && firstItem.name === secondItem.name;
  });
};

const readStoredBuyNowItem = (): CartItem | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
    return rawValue ? normalizeStoredCartItem(JSON.parse(rawValue)) : null;
  } catch (error) {
    console.error("Unable to read buy now item", error);
    return null;
  }
};

const writeStoredBuyNowItem = (item: CartItem | null) => {
  if (typeof window === "undefined") return;

  if (!item) {
    window.sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(item));
};

const getUserCartCollection = (userId: string) => collection(db, "users", userId, "cart");

const cartItemToFirestore = (item: CartItem): Record<string, unknown> => {
  const data: Record<string, unknown> = {
    productId: item.productId,
    sourceId: item.sourceId || item.productId,
    itemType: item.itemType || "product",
    name: item.name,
    category: item.category,
    categoryLabel: item.categoryLabel,
    quantity: item.quantity,
    amountInPaise: item.amountInPaise,
    displayPrice: item.displayPrice,
    stockStatus: item.stockStatus,
    updatedAt: serverTimestamp(),
  };

  if (item.image) data.image = item.image;
  if (typeof item.maxQuantity === "number") data.maxQuantity = item.maxQuantity;
  data.addedAt = item.addedAt || serverTimestamp();

  return data;
};

const readUserCartItems = async (userId: string): Promise<CartItem[]> => {
  const snapshot = await getDocs(getUserCartCollection(userId));
  return snapshot.docs
    .map((cartDoc) => normalizeStoredCartItem(cartDoc.data(), cartDoc.id))
    .filter((item): item is CartItem => item !== null);
};

const replaceUserCartItems = async (userId: string, items: CartItem[]) => {
  const batch = writeBatch(db);
  const cartCollection = getUserCartCollection(userId);
  const currentSnapshot = await getDocs(cartCollection);

  currentSnapshot.docs.forEach((cartDoc) => {
    batch.delete(cartDoc.ref);
  });

  items.forEach((item) => {
    batch.set(doc(cartCollection, item.productId), cartItemToFirestore(item));
  });

  await batch.commit();
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>(() => readStoredItems(CART_STORAGE_KEY));
  const [buyNowItem, setBuyNowItemState] = useState<CartItem | null>(() => readStoredBuyNowItem());
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setItems(readStoredItems(CART_STORAGE_KEY));
      setLoading(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const syncCart = async () => {
      setLoading(true);
      const pendingAuthItems = readPendingAuthItems();
      const guestItems = readStoredItems(CART_STORAGE_KEY);

      if (pendingAuthItems !== null) {
        setItems(pendingAuthItems);
        await replaceUserCartItems(user.uid, pendingAuthItems);
        removeStoredItems(CART_STORAGE_KEY);
      } else if (guestItems.length > 0) {
        const remoteItems = await readUserCartItems(user.uid);
        await replaceUserCartItems(user.uid, mergeCartItems(remoteItems, guestItems));
        removeStoredItems(CART_STORAGE_KEY);
      }

      if (cancelled) return;

      unsubscribe = onSnapshot(
        getUserCartCollection(user.uid),
        (snapshot) => {
          const nextItems = snapshot.docs
            .map((cartDoc) => normalizeStoredCartItem(cartDoc.data(), cartDoc.id))
            .filter((item): item is CartItem => item !== null);
          const pendingItems = readPendingAuthItems();
          if (pendingItems !== null) {
            setItems(pendingItems);
            if (cartItemsMatch(nextItems, pendingItems)) clearPendingAuthItems();
          } else {
            setItems(nextItems);
          }
          setLoading(false);
        },
        (error) => {
          console.error("Unable to sync cart", error);
          setLoading(false);
        }
      );
    };

    syncCart().catch((error) => {
      console.error("Unable to initialize cart", error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authLoading, user]);

  const cart = useMemo(() => createCart(items, user?.uid), [items, user?.uid]);

  const persistItems = useCallback(async (nextItems: CartItem[]) => {
    setItems(nextItems);

    if (user) {
      writePendingAuthItems(nextItems);
      try {
        await replaceUserCartItems(user.uid, nextItems);
      } catch (error) {
        // Keep the cart usable even if Firestore sync fails for the current session.
        console.error("Unable to persist authenticated cart, falling back to local storage", error);
        writeStoredItems(CART_STORAGE_KEY, nextItems);
      }
      return;
    }

    writeStoredItems(CART_STORAGE_KEY, nextItems);
  }, [user]);

  const addItem = useCallback(async (item: CartItem) => {
    const normalizedItem = {
      ...item,
      quantity: clampCartQuantity(item.quantity, item.maxQuantity),
    };
    await persistItems(mergeCartItems(items, [normalizedItem]));
  }, [items, persistItems]);

  const addProduct = useCallback(async (product: Product, quantity = 1) => {
    if (!isProductPurchasable(product)) {
      throw new Error("This product is not available for purchase.");
    }

    await addItem(createCartItemFromProduct(product, quantity));
  }, [addItem]);

  const setItemQuantity = useCallback(async (productId: string, quantity: number) => {
    await persistItems(setCartItemQuantity(items, productId, quantity));
  }, [items, persistItems]);

  const incrementItem = useCallback(async (productId: string) => {
    const currentItem = items.find((item) => item.productId === productId);
    if (!currentItem) return;
    await setItemQuantity(productId, currentItem.quantity + 1);
  }, [items, setItemQuantity]);

  const decrementItem = useCallback(async (productId: string) => {
    const currentItem = items.find((item) => item.productId === productId);
    if (!currentItem) return;
    await setItemQuantity(productId, Math.max(1, currentItem.quantity - 1));
  }, [items, setItemQuantity]);

  const removeItem = useCallback(async (productId: string) => {
    await persistItems(removeCartItem(items, productId));
  }, [items, persistItems]);

  const clearCart = useCallback(async () => {
    await persistItems([]);
  }, [persistItems]);

  const setBuyNowItem = useCallback((item: CartItem) => {
    const normalizedItem = { ...item, quantity: clampCartQuantity(item.quantity, item.maxQuantity) };
    setBuyNowItemState(normalizedItem);
    writeStoredBuyNowItem(normalizedItem);
  }, []);

  const setBuyNowProduct = useCallback((product: Product, quantity = 1) => {
    if (!isProductPurchasable(product)) {
      throw new Error("This product is not available for purchase.");
    }

    setBuyNowItem(createCartItemFromProduct(product, quantity));
  }, [setBuyNowItem]);

  const clearBuyNowItem = useCallback(() => {
    setBuyNowItemState(null);
    writeStoredBuyNowItem(null);
  }, []);

  const value = useMemo<CartContextType>(() => ({
    cart,
    items,
    totalItems: cart.totals.totalItems,
    loading,
    isOpen,
    buyNowItem,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addProduct,
    addItem,
    setItemQuantity,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    setBuyNowProduct,
    setBuyNowItem,
    clearBuyNowItem,
  }), [
    addItem,
    addProduct,
    buyNowItem,
    cart,
    clearCart,
    clearBuyNowItem,
    decrementItem,
    incrementItem,
    isOpen,
    items,
    loading,
    removeItem,
    setBuyNowItem,
    setBuyNowProduct,
    setItemQuantity,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
