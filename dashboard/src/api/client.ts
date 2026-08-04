/**
 * API client with JWT authentication
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// The backend (Azure Container Apps) scales to zero when idle, so the first request
// after a period of inactivity has to cold-start a new container instance instead of
// hitting a warm one - see terraform/environments/dev.tfvars (container_min_replicas)
// and dashboard/src/pages/Login.tsx's cold-start hint. A generous timeout plus a couple
// of retries on GET requests lets the dashboard ride that out instead of surfacing a
// hard failure for what's really just "still waking up".
const REQUEST_TIMEOUT_MS = 45000;
const COLD_START_RETRY_DELAY_MS = 3000;
const MAX_COLD_START_RETRIES = 2;

interface RetryableConfig extends AxiosRequestConfig {
  _coldStartRetryCount?: number;
}

function isColdStartFailure(error: any): boolean {
  const status = error.response?.status;
  return error.code === 'ECONNABORTED' || status === 502 || status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // For refresh token cookies
    });

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 errors, and transparently retry GETs that fail while the backend is
    // cold-starting (mutating requests are left alone - retrying a POST/PUT blind could
    // duplicate the action).
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        const config = error.config as RetryableConfig | undefined;
        if (config && config.method?.toLowerCase() === 'get' && isColdStartFailure(error)) {
          const retryCount = config._coldStartRetryCount ?? 0;
          if (retryCount < MAX_COLD_START_RETRIES) {
            config._coldStartRetryCount = retryCount + 1;
            await delay(COLD_START_RETRY_DELAY_MS);
            return this.client.request(config);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  getClient() {
    return this.client;
  }
}

export const apiClient = new ApiClient().getClient();
