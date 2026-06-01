# Forest Bush JS SDK

The official Javascript SDK for the Forest Bush feature flag and experimentation platform.

This SDK is designed to be lightweight and work in both Node.js and browser environments. It provides a simple interface to evaluate feature flags from your Forest Bush API.

## Installation

```bash
npm install @forest-bush/sdk-js
```

## Usage

First, import and initialize the client with the host of your deployed Forest Bush API.

```typescript
import { ForestBushClient } from '@forest-bush/sdk-js';

const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev', // your api host
  environment: 'production',           // optional: defaults to production
});

// example usage in an async function
async function checkMyFeature() {
  const isEnabled = await forestBush.evaluate(
    'new-cool-feature', // the key of the flag you want to evaluate
    false,              // a default value to return in case of any errors
    'user-123'          // optional: a user id for sticky rollouts
  );

  if (isEnabled) {
    console.log('the new cool feature is enabled for user-123!');
    // show the new feature...
  } else {
    console.log('the new cool feature is not enabled for user-123.');
    // show the old feature or nothing...
  }
}

checkMyFeature();
```

## Local mode

By default the client evaluates flags remotely, making one request per check.
In `local` mode the client instead polls an environment snapshot in the
background and evaluates flags locally, with no per-check network request. If a
refresh fails it keeps serving the last good snapshot (offline fallback), and
before any snapshot has loaded it returns your `defaultValue`.

```typescript
const forestBush = new ForestBushClient({
  host: 'https://forest-bush.fly.dev',
  environment: 'production',
  mode: 'local',
  pollIntervalSeconds: 30, // optional, defaults to 30
});

await forestBush.start(); // load the initial snapshot and begin polling

const isEnabled = await forestBush.evaluate('new-cool-feature', false, 'user-123');

// when shutting down
forestBush.stop();
```

Local evaluation uses the same percentage-rollout hashing as the server, so a
given `userId` lands in the same bucket either way. Calling `evaluate` before
`start()` triggers a one-time lazy snapshot load.

## API Reference

### `new ForestBushClient(config)`

Creates a new client instance.

-   `config` (`ForestBushClientConfig`):
    -   `host` (string, required): The base URL of your Forest Bush API.
    -   `environment` (`development` | `staging` | `production`, optional): Default environment. Defaults to `production`.
    -   `cacheTTL` (number, optional): In-memory cache TTL in seconds for remote mode. Defaults to `0` (disabled).
    -   `mode` (`remote` | `local`, optional): Evaluation mode. Defaults to `remote`.
    -   `pollIntervalSeconds` (number, optional): Snapshot refresh interval in local mode. Defaults to `30`.

### `client.start()` / `client.stop()`

Starts and stops background snapshot polling in `local` mode. No-ops in
`remote` mode.

### `client.evaluate(key, defaultValue, userId, environment)`

Asynchronously evaluates a feature flag.

-   `key` (string, required): The key of the flag to evaluate.
-   `defaultValue` (boolean, required): The safe default value to return in case the API is unreachable or an error occurs.
-   `userId` (string, optional): A unique identifier for the user. Providing this ensures that percentage-based rollouts are "sticky" for that user.
-   `environment` (`development`, `staging`, or `production`, optional): Overrides the client's default environment for this evaluation (remote mode only; local mode always uses the client's environment).

Returns a `Promise<boolean>` with the evaluated state of the flag.

## Examples

Example usage lives in `examples/`:

- `node.ts` (remote mode)
- `node-local.ts` (local snapshot mode)
- `react.tsx`
- `nextjs.ts`
