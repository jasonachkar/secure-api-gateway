export interface DashboardEnvironment {
  apiBaseUrl: string;
  isProduction: boolean;
  showFixtureCredentials: boolean;
}

interface ViteEnvironmentInput {
  VITE_API_URL?: string;
  MODE?: string;
  PROD?: boolean;
  DEV?: boolean;
}

export function parseEnvironment(input: ViteEnvironmentInput): DashboardEnvironment {
  const isProduction = input.PROD === true || input.MODE === 'production';
  const configured = input.VITE_API_URL?.trim();

  if (!configured && isProduction) {
    throw new Error('VITE_API_URL is required for production builds');
  }

  const candidate = configured || 'http://localhost:3000';
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('VITE_API_URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_API_URL must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an origin without credentials, path, query, or fragment');
  }
  if (isProduction && url.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use HTTPS for production builds');
  }

  return {
    apiBaseUrl: url.origin,
    isProduction,
    showFixtureCredentials: !isProduction && input.DEV !== false,
  };
}

export const environment = parseEnvironment(import.meta.env);
