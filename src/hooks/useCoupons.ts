import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isCouponActive, normalizeCoupon, type Coupon } from "@/lib/ecommerce";

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

  const checkoutCoupons = useMemo(() => coupons.filter((coupon) => coupon.visibleAtCheckout && isCouponActive(coupon)), [coupons]);

  return { coupons, checkoutCoupons, loading };
};
