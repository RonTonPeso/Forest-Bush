// A simple API client to interact with the Forest Bush backend.

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export const apiClient = {
  getApiUrl: () => {
    // Use environment variable for production, fallback for development
    return import.meta.env.VITE_API_URL || 'http://localhost:8080';
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
  getFlags: async (apiKey: string): Promise<FeatureFlag[]> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags`, {
      method: 'GET',
      headers: apiClient.getHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch flags.');
    }
    return response.json();
  },

  // Method to update a feature flag (e.g., toggle it)
  updateFlag: async (apiKey: string, key: string, data: Partial<FeatureFlag>): Promise<FeatureFlag> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags/${key}`, {
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
  createFlag: async (apiKey: string, data: { key: string; description: string }): Promise<FeatureFlag> => {
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
  deleteFlag: async (apiKey: string, key: string): Promise<void> => {
    const response = await fetch(`${apiClient.getApiUrl()}/admin/flags/${key}`, {
      method: 'DELETE',
      headers: apiClient.getHeaders(apiKey),
    });
    if (!response.ok) {
      throw new Error('Failed to delete flag.');
    }
  },
}; 