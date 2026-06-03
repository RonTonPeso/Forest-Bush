// A simple API client to interact with the Forest Bush backend.

export interface FeatureFlag {
  key: string;
  environment: Environment;
  description: string;
  enabled: boolean;
  rules?: {
    rolloutPercentage?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  flagKey: string;
  environment: Environment;
  action: 'create' | 'update' | 'toggle' | 'delete';
  actor: string;
  before?: FeatureFlag | null;
  after?: FeatureFlag | null;
  createdAt: string;
}

export interface EvaluationTrace {
  environment: string | null;
  flagFound: boolean;
  flagEnabled: boolean;
  rule: 'none' | 'rolloutPercentage';
  rolloutPercentage: number | null;
  userId: string | null;
  bucket: number | null;
}

export interface EvaluationResult {
  key: string;
  enabled: boolean;
  reason: string;
  trace?: EvaluationTrace;
}

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
export const DEFAULT_ENVIRONMENT: Environment = 'production';

export type FeatureFlagUpdate = {
  description?: string;
  enabled?: boolean;
  rules?: {
    rolloutPercentage?: number;
  } | null;
};

export const apiClient = {
  getApiUrl: () => {
    // Use environment variable for production, fallback for development
    return import.meta.env.VITE_API_URL || 'http://localhost:8080';
  },

  getEnvironmentQuery: (environment: Environment = DEFAULT_ENVIRONMENT) => {
    return `?environment=${encodeURIComponent(environment)}`;
  },

  getHeaders: (apiKey: string) => {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };
  },

  // Method to check if an API key is valid
  verifyApiKey: async (apiKey: string): Promise<boolean> => {
    try {
      const response = await fetch(`${apiClient.getApiUrl()}/admin/flags`, {
        method: 'GET',
        headers: apiClient.getHeaders(apiKey),
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to verify API key:', error);
      return false;
    }
  },

  // Method to get all feature flags
  getFlags: async (apiKey: string, environment: Environment = DEFAULT_ENVIRONMENT): Promise<FeatureFlag[]> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags${apiClient.getEnvironmentQuery(environment)}`, {
      method: 'GET',
      headers: apiClient.getHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch flags.');
    }
    return response.json();
  },

  // Method to update a feature flag (e.g., toggle it)
  updateFlag: async (
    apiKey: string,
    key: string,
    data: FeatureFlagUpdate,
    environment: Environment = DEFAULT_ENVIRONMENT
  ): Promise<FeatureFlag> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags/${key}${apiClient.getEnvironmentQuery(environment)}`, {
      method: 'PUT',
      headers: apiClient.getHeaders(apiKey),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update flag.');
    }
    return response.json();
  },

  // Method to create a new feature flag
  createFlag: async (
    apiKey: string,
    data: { key: string; description: string; environment?: Environment }
  ): Promise<FeatureFlag> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags`, {
      method: 'POST',
      headers: apiClient.getHeaders(apiKey),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to create flag.' }));
      throw new Error(errorData.message);
    }
    return response.json();
  },

  // Method to delete a feature flag
  deleteFlag: async (
    apiKey: string,
    key: string,
    environment: Environment = DEFAULT_ENVIRONMENT
  ): Promise<void> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags/${key}${apiClient.getEnvironmentQuery(environment)}`, {
      method: 'DELETE',
      headers: apiClient.getHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error('Failed to delete flag.');
    }
  },

  getFlagAudit: async (
    apiKey: string,
    key: string,
    environment: Environment = DEFAULT_ENVIRONMENT
  ): Promise<AuditEvent[]> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags/${key}/audit${apiClient.getEnvironmentQuery(environment)}`, {
      method: 'GET',
      headers: apiClient.getHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch audit events.');
    }
    return response.json();
  },

  evaluateFlag: async (
    key: string,
    environment: Environment = DEFAULT_ENVIRONMENT,
    userId?: string,
    explain = false
  ): Promise<EvaluationResult> => {
    const searchParams = new URLSearchParams({ environment });
    if (userId) {
      searchParams.set('userId', userId);
    }
    if (explain) {
      searchParams.set('explain', 'true');
    }

    const response = await fetch(`${apiClient.getApiUrl()}/flags/${key}?${searchParams.toString()}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error('Failed to evaluate flag.');
    }
    return response.json();
  },
};
