/**
 * API client with JWT authentication
 */

import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    console.log('API Client initialized with URL:', API_URL);
    this.client = axios.create({
      baseURL: API_URL,
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
      console.log('Axios request:', config.method?.toUpperCase(), config.url, config);
      return config;
    });

    // Handle 401 errors
    this.client.interceptors.response.use(
      (response) => {
        console.log('Axios response:', response.status, response.config.url);
        return response;
      },
      (error) => {
        console.error('Axios error:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          config: error.config,
        });
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
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
