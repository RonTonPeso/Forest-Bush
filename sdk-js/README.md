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

## API Reference

### `new ForestBushClient(config)`

Creates a new client instance.

-   `config` (`ForestBushClientConfig`):
    -   `host` (string, required): The base URL of your Forest Bush API.

### `client.evaluate(key, defaultValue, userId, environment)`

Asynchronously evaluates a feature flag.

-   `key` (string, required): The key of the flag to evaluate.
-   `defaultValue` (boolean, required): The safe default value to return in case the API is unreachable or an error occurs.
-   `userId` (string, optional): A unique identifier for the user. Providing this ensures that percentage-based rollouts are "sticky" for that user.
-   `environment` (`development`, `staging`, or `production`, optional): Overrides the client's default environment for this evaluation.

Returns a `Promise<boolean>` with the evaluated state of the flag.

## Examples

Example usage lives in `examples/`:

- `node.ts`
- `react.tsx`
- `nextjs.ts`
