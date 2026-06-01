import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  cacheTTL: 30,
});

const enabled = await forestBush.evaluate('new-checkout-flow', false, 'user-123');

console.log(`new-checkout-flow enabled: ${enabled}`);
