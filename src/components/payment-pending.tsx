"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Stripe sends the client back a few seconds before its webhook confirms the
 * booking. Re-fetch the page every 3s for up to a minute so it flips to
 * "You're booked in" by itself.
 */
export function PaymentPending() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p className="mt-4 text-base leading-relaxed text-ink-soft">
      {gaveUp
        ? "Still waiting to hear from the payment provider. If you paid, this page will update shortly — refresh it in a minute. If you didn't finish paying, your slot is released after 30 minutes."
        : "Confirming your payment… this usually takes a few seconds."}
    </p>
  );
}
