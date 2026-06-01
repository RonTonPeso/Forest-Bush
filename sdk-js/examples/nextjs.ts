import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: process.env.FOREST_BUSH_API_URL || 'https://forest-bush.fly.dev',
  environment: 'production',
  cacheTTL: 30,
});

export async function getCheckoutVariant(userId: string) {
  return forestBush.evaluate('new-checkout-flow', false, userId);
}
