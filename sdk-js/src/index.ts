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
   * Defaults to 0 (caching disabled).
   */
  cacheTTL?: number;
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

/**
 * The main client for interacting with the Forest Bush feature flag service.
 */
export class ForestBushClient {
  private config: ForestBushClientConfig;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: ForestBushClientConfig) {
    if (!config.host) {
      throw new Error('Forest Bush SDK: host is required in config.');
    }
    this.config = {
      cacheTTL: 0,
      environment: 'production',
      ...config,
    };
  }

  /**
   * Evaluates a feature flag and returns whether it is enabled for the given context.
   *
   * @param key The unique key of the feature flag.
   * @param defaultValue The default value to return if the flag cannot be evaluated.
   * @param userId An optional user ID for consistent, "sticky" rollouts.
   * @param environment An optional environment override.
   * @returns A promise that resolves to a boolean indicating if the feature is enabled.
   */
  public async evaluate(
    key: string,
    defaultValue: boolean,
    userId?: string,
    environment = this.config.environment || 'production'
  ): Promise<boolean> {
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
   * Clears the in-memory cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
