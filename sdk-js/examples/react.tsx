import { useEffect, useState } from 'react';
import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  cacheTTL: 30,
});

export function CheckoutGate({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    forestBush.evaluate('new-checkout-flow', false, userId).then((value) => {
      if (!cancelled) {
        setEnabled(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return enabled ? <NewCheckout /> : <LegacyCheckout />;
}

function NewCheckout() {
  return <div>New checkout</div>;
}

function LegacyCheckout() {
  return <div>Legacy checkout</div>;
}
