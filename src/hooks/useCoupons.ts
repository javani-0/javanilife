import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isCouponActive, normalizeCoupon, type Coupon } from "@/lib/ecommerce";

export const getRedeemableCoupons = (coupons: Coupon[], now = new Date()) => (
  coupons.filter((coupon) => isCouponActive(coupon, now))
);

export const getCheckoutCoupons = (coupons: Coupon[], now = new Date()) => (
  getRedeemableCoupons(coupons, now).filter((coupon) => coupon.visibleAtCheckout)
);

export const useCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "coupons"),
      (snapshot) => {
        const nextCoupons = snapshot.docs
          .map((couponDocument) => normalizeCoupon(couponDocument.id, couponDocument.data()))
          .sort((firstCoupon, secondCoupon) => firstCoupon.code.localeCompare(secondCoupon.code));
        setCoupons(nextCoupons);
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load coupons", error);
        setCoupons([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const redeemableCoupons = useMemo(() => getRedeemableCoupons(coupons), [coupons]);
  const checkoutCoupons = useMemo(() => getCheckoutCoupons(coupons), [coupons]);

  return { coupons, redeemableCoupons, checkoutCoupons, loading };
};
