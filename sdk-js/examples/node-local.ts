import { ForestBushClient } from '@forest-bush/sdk-js';

// Local mode: poll a snapshot in the background and evaluate flags locally,
// with no network request per check. Falls back to the last good snapshot if a
// refresh fails, and to the default value before any snapshot has loaded.
const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  mode: 'local',
  pollIntervalSeconds: 30,
});

await forestBush.start();

const enabled = await forestBush.evaluate('new-checkout-flow', false, 'user-123');
console.log(`new-checkout-flow enabled: ${enabled}`);

forestBush.stop();
