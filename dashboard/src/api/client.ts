import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { environment } from '../config/environment';
import {
  clearAccessToken,
  getAccessToken,
  getTokenVersion,
  setAccessToken,
} from '../auth/tokenStore';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
  _tokenVersion?: number;
}

interface RefreshResponse {
  accessToken: string;
}

const AUTH_EXCLUSIONS = new Set([
  '/auth/login',
  '/auth/demo-login',
  '/auth/refresh',
  '/auth/logout',
]);

export const refreshHttpClient = axios.create({
  baseURL: environment.apiBaseUrl,
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;

function endpointPath(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url, environment.apiBaseUrl).pathname;
  } catch {
    return url.split('?')[0];
  }
}

export function isRefreshExcluded(url?: string): boolean {
  return AUTH_EXCLUSIONS.has(endpointPath(url));
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshHttpClient
      .post<RefreshResponse>('/auth/refresh', {})
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch((error) => {
        clearAccessToken();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

class ApiClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: environment.apiBaseUrl,
      withCredentials: true,
    });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const request = config as RetriableRequestConfig;
      const token = getAccessToken();
      request._tokenVersion = getTokenVersion();
      if (token) request.headers.Authorization = `Bearer ${token}`;
      return request;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const request = error.config as RetriableRequestConfig | undefined;
        if (
          error.response?.status !== 401 ||
          !request ||
          request._authRetry ||
          isRefreshExcluded(request.url)
        ) {
          throw error;
        }

        request._authRetry = true;
        let token = getAccessToken();
        if (!token || request._tokenVersion === getTokenVersion()) {
          token = await refreshAccessToken();
        }

        request.headers.Authorization = `Bearer ${token}`;
        return this.client.request(request);
      }
    );
  }

  getClient(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient().getClient();
