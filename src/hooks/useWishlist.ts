import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { createWishlistItemFromProduct, normalizeWishlistItem, type Product, type WishlistItem } from "@/lib/ecommerce";

export const useWishlist = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "wishlist"),
      (snapshot) => {
        setItems(snapshot.docs.map((wishlistDoc) => normalizeWishlistItem(wishlistDoc.id, wishlistDoc.data())));
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load wishlist", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const itemIds = useMemo(() => new Set(items.map((item) => item.productId)), [items]);
  const isWishlisted = useCallback((productId: string) => itemIds.has(productId), [itemIds]);

  const addToWishlist = useCallback(async (product: Product) => {
    if (!user) throw new Error("Please sign in to use your wishlist.");

    await setDoc(doc(db, "users", user.uid, "wishlist", product.id), {
      ...createWishlistItemFromProduct(product),
      addedAt: serverTimestamp(),
    });
  }, [user]);

  const removeFromWishlist = useCallback(async (productId: string) => {
    if (!user) throw new Error("Please sign in to use your wishlist.");
    await deleteDoc(doc(db, "users", user.uid, "wishlist", productId));
  }, [user]);

  const toggleWishlist = useCallback(async (product: Product) => {
    if (isWishlisted(product.id)) {
      await removeFromWishlist(product.id);
      return "removed" as const;
    }

    await addToWishlist(product);
    return "added" as const;
  }, [addToWishlist, isWishlisted, removeFromWishlist]);

  return {
    items,
    loading,
    isWishlisted,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
  };
};