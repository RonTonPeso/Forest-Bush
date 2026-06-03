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
  /**
   * An initial snapshot for 'local' mode. When provided, the client can
   * evaluate flags immediately, before start() or any network request. A
   * background refresh still runs once start() is called.
   */
  bootstrap?: Snapshot;
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

export interface SnapshotFlag {
  key: string;
  enabled: boolean;
  rules: { rolloutPercentage?: number } | null;
}

export interface Snapshot {
  environment: string;
  version: string;
  generatedAt: string;
  checksum: string;
  flags: SnapshotFlag[];
}

/**
 * Why an evaluation produced its value. Mirrors the server's reason taxonomy in
 * api/src/app.js, plus 'fallback' for when the SDK returns the caller's default
 * (no snapshot loaded yet, or the flag is absent from the snapshot).
 */
export type EvaluationReason =
  | 'flag_not_found'
  | 'disabled'
  | 'enabled_no_rules'
  | 'context_required'
  | 'rollout_match'
  | 'rollout_miss'
  | 'fallback';

export interface EvaluationTrace {
  environment: string;
  flagFound: boolean;
  flagEnabled: boolean;
  rule: 'none' | 'rolloutPercentage';
  rolloutPercentage: number | null;
  userId: string | null;
  bucket: number | null;
  /** True when serving a snapshot whose last refresh failed. */
  stale: boolean;
}

export interface TracedEvaluation {
  enabled: boolean;
  reason: EvaluationReason;
  trace: EvaluationTrace;
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
  private stale = false;

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

    // Seed from a bootstrap snapshot so local evaluation works before any
    // network request.
    if (config.bootstrap) {
      this.setSnapshot(config.bootstrap);
    }
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
      const { enabled } = await this.evaluateWithTrace(key, defaultValue, userId);
      return enabled;
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

  // Stores a snapshot and rebuilds the by-key lookup. Marks the data fresh.
  private setSnapshot(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.snapshotFlags = new Map(snapshot.flags.map((flag) => [flag.key, flag]));
    this.stale = false;
  }

  // Fetches the latest snapshot. On failure it keeps the last good snapshot and
  // marks it stale (offline fallback) rather than throwing.
  private async refreshSnapshot(): Promise<void> {
    const environment = this.config.environment || 'production';
    const url = new URL(`/environments/${environment}/snapshot`, this.config.host);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`Forest Bush SDK: snapshot request failed with status ${response.status}.`);
        if (this.snapshot) this.stale = true;
        return;
      }

      this.setSnapshot((await response.json()) as Snapshot);
    } catch (error) {
      console.error('Forest Bush SDK: failed to refresh snapshot, keeping last known values.', error);
      if (this.snapshot) this.stale = true;
    }
  }

  /**
   * Like evaluate(), but returns the value plus a trace explaining the decision
   * (local mode only). Falls back to defaultValue with reason 'fallback' when no
   * snapshot is loaded or the flag is absent from the snapshot.
   */
  public async evaluateWithTrace(
    key: string,
    defaultValue: boolean,
    userId?: string
  ): Promise<TracedEvaluation> {
    await this.ensureSnapshot();
    return this.evaluateLocal(key, defaultValue, userId);
  }

  // Local evaluation mirroring api/src/app.js#evaluateFlag, with the same reason
  // taxonomy and bucket hashing. Unknown flags and a never-loaded snapshot fall
  // back to the caller's defaultValue with reason 'fallback'.
  private async evaluateLocal(key: string, defaultValue: boolean, userId?: string): Promise<TracedEvaluation> {
    const flag = this.snapshot ? this.snapshotFlags.get(key) : undefined;

    const trace: EvaluationTrace = {
      environment: this.config.environment || 'production',
      flagFound: Boolean(flag),
      flagEnabled: Boolean(flag?.enabled),
      rule: 'none',
      rolloutPercentage: null,
      userId: userId ?? null,
      bucket: null,
      stale: this.stale,
    };

    if (!flag) {
      return { enabled: defaultValue, reason: 'fallback', trace };
    }

    if (!flag.enabled) {
      return { enabled: false, reason: 'disabled', trace };
    }

    const rolloutPercentage = flag.rules ? flag.rules.rolloutPercentage : undefined;
    if (!flag.rules || Object.keys(flag.rules).length === 0 || rolloutPercentage === undefined) {
      return { enabled: true, reason: 'enabled_no_rules', trace };
    }

    trace.rule = 'rolloutPercentage';
    trace.rolloutPercentage = rolloutPercentage;

    if (!userId) {
      // Matches the server: percentage rollouts need a userId to be sticky.
      return { enabled: false, reason: 'context_required', trace };
    }

    const bucket = await hashToBucket(key, userId);
    trace.bucket = bucket;
    const enabled = bucket < rolloutPercentage;

    return { enabled, reason: enabled ? 'rollout_match' : 'rollout_miss', trace };
  }
}
