/**
 * Configuration options for the Forest Bush client.
 */
export interface ForestBushClientConfig {
  host: string; // the base url of the forest bush api (e.g., 'https://forest-bush.fly.dev')
  /**
   * The default flag environment.
   * Defaults to "production".
   */
  environment?: 'development' | 'staging' | 'production';
  /**
   * The time-to-live for in-memory cache entries in seconds.
   * Only used in 'remote' mode. Defaults to 0 (caching disabled).
   */
  cacheTTL?: number;
  /**
   * Evaluation mode.
   * - 'remote' (default): each evaluate() makes one HTTP request to the API.
   * - 'local': flags are evaluated from a snapshot polled in the background,
   *   so there is no per-check network request.
   */
  mode?: 'remote' | 'local';
  /**
   * How often to refresh the snapshot in 'local' mode, in seconds.
   * Defaults to 30.
   */
  pollIntervalSeconds?: number;
}

interface EvaluationResponse {
  key: string;
  enabled: boolean;
  reason: string;
}

interface CacheEntry {
  value: boolean;
  expiry: number;
}

interface SnapshotFlag {
  key: string;
  enabled: boolean;
  rules: { rolloutPercentage?: number } | null;
}

interface Snapshot {
  environment: string;
  version: string;
  generatedAt: string;
  checksum: string;
  flags: SnapshotFlag[];
}

// Maps a flag key + userId to a stable bucket in [0, 100).
// Must match the server's hashing in api/src/app.js (evaluateFlag): sha256 of
// `${key}:${userId}`, first 4 bytes (8 hex chars) read as an integer mod 100.
async function hashToBucket(key: string, userId: string): Promise<number> {
  const data = new TextEncoder().encode(`${key}:${userId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return parseInt(hex, 16) % 100;
}

/**
 * The main client for interacting with the Forest Bush feature flag service.
 */
export class ForestBushClient {
  private config: ForestBushClientConfig;
  private cache: Map<string, CacheEntry> = new Map();

  // Local mode state.
  private snapshot: Snapshot | null = null;
  private snapshotFlags: Map<string, SnapshotFlag> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private loadingPromise: Promise<void> | null = null;

  constructor(config: ForestBushClientConfig) {
    if (!config.host) {
      throw new Error('Forest Bush SDK: host is required in config.');
    }
    this.config = {
      cacheTTL: 0,
      environment: 'production',
      mode: 'remote',
      pollIntervalSeconds: 30,
      ...config,
    };
  }

  /**
   * Starts background snapshot polling for 'local' mode. Loads an initial
   * snapshot, then refreshes it on the configured interval. No-op in 'remote'
   * mode. Safe to call more than once.
   */
  public async start(): Promise<void> {
    if (this.config.mode !== 'local' || this.pollTimer) {
      return;
    }

    await this.refreshSnapshot();

    const intervalMs = (this.config.pollIntervalSeconds || 30) * 1000;
    this.pollTimer = setInterval(() => {
      void this.refreshSnapshot();
    }, intervalMs);

    // Don't keep a Node process alive just for polling (no-op in browsers).
    (this.pollTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Stops background snapshot polling.
   */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Evaluates a feature flag and returns whether it is enabled for the given context.
   *
   * @param key The unique key of the feature flag.
   * @param defaultValue The default value to return if the flag cannot be evaluated.
   * @param userId An optional user ID for consistent, "sticky" rollouts.
   * @param environment An optional environment override (remote mode only).
   * @returns A promise that resolves to a boolean indicating if the feature is enabled.
   */
  public async evaluate(
    key: string,
    defaultValue: boolean,
    userId?: string,
    environment = this.config.environment || 'production'
  ): Promise<boolean> {
    if (this.config.mode === 'local') {
      // Load lazily if start() was never called, so the client still works.
      await this.ensureSnapshot();
      return this.evaluateFromSnapshot(key, defaultValue, userId);
    }

    const cacheKey = `${environment}:${key}:${userId || ''}`;
    const cacheTTL = this.config.cacheTTL || 0;

    // Check cache first if TTL is greater than 0
    if (cacheTTL > 0) {
      const entry = this.cache.get(cacheKey);
      if (entry && Date.now() < entry.expiry) {
        return entry.value;
      }
    }

    const url = new URL(`/flags/${key}`, this.config.host);
    if (userId) {
      url.searchParams.append('userId', userId);
    }
    url.searchParams.append('environment', environment);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Forest Bush SDK: API request failed with status ${response.status} for flag '${key}'.`);
        return defaultValue;
      }

      const data = (await response.json()) as EvaluationResponse;

      // Store in cache if TTL is greater than 0
      if (cacheTTL > 0) {
        const expiry = Date.now() + cacheTTL * 1000;
        this.cache.set(cacheKey, { value: data.enabled, expiry });
      }

      return data.enabled;
    } catch (error) {
      console.error(`Forest Bush SDK: An error occurred while evaluating flag '${key}'.`, error);
      return defaultValue;
    }
  }

  /**
   * Clears the in-memory cache (remote mode).
   */
  public clearCache(): void {
    this.cache.clear();
  }

  // Ensures at least one snapshot load has been attempted, sharing a single
  // in-flight request so concurrent evaluate() calls don't all fetch.
  private async ensureSnapshot(): Promise<void> {
    if (this.snapshot) {
      return;
    }
    if (!this.loadingPromise) {
      this.loadingPromise = this.refreshSnapshot().finally(() => {
        this.loadingPromise = null;
      });
    }
    await this.loadingPromise;
  }

  // Fetches the latest snapshot. On failure it keeps the last good snapshot
  // (offline fallback) rather than throwing.
  private async refreshSnapshot(): Promise<void> {
    const environment = this.config.environment || 'production';
    const url = new URL(`/environments/${environment}/snapshot`, this.config.host);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Forest Bush SDK: snapshot request failed with status ${response.status}.`);
        return;
      }

      const next = (await response.json()) as Snapshot;
      this.snapshot = next;
      this.snapshotFlags = new Map(next.flags.map((flag) => [flag.key, flag]));
    } catch (error) {
      console.error('Forest Bush SDK: failed to refresh snapshot, keeping last known values.', error);
    }
  }

  // Local evaluation mirroring api/src/app.js#evaluateFlag. Unknown flags and a
  // never-loaded snapshot fall back to the caller's defaultValue.
  private async evaluateFromSnapshot(key: string, defaultValue: boolean, userId?: string): Promise<boolean> {
    if (!this.snapshot) {
      return defaultValue;
    }

    const flag = this.snapshotFlags.get(key);
    if (!flag) {
      return defaultValue;
    }

    if (!flag.enabled) {
      return false;
    }

    const rules = flag.rules;
    if (!rules || Object.keys(rules).length === 0) {
      return true;
    }

    const { rolloutPercentage } = rules;
    if (rolloutPercentage !== undefined) {
      if (!userId) {
        // Matches the server: percentage rollouts need a userId to be sticky.
        return false;
      }
      const bucket = await hashToBucket(key, userId);
      return bucket < rolloutPercentage;
    }

    return true;
  }
}
