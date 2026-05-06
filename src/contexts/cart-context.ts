import { createContext, useContext } from "react";
import type { CartItem, Cart, Product } from "@/lib/ecommerce";

export interface CartContextType {
  cart: Cart;
  items: CartItem[];
  totalItems: number;
  loading: boolean;
  isOpen: boolean;
  buyNowItem: CartItem | null;
  openCart: () => void;
  closeCart: () => void;
  addProduct: (product: Product, quantity?: number) => Promise<void>;
  addItem: (item: CartItem) => Promise<void>;
  setItemQuantity: (productId: string, quantity: number) => Promise<void>;
  incrementItem: (productId: string) => Promise<void>;
  decrementItem: (productId: string) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  setBuyNowProduct: (product: Product, quantity?: number) => void;
  setBuyNowItem: (item: CartItem) => void;
  clearBuyNowItem: () => void;
}

export const CartContext = createContext<CartContextType | null>(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
};