import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5180/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

export const IMAGE_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5180/api').replace('/api', '');

// Request Interceptor: Attach access token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401s and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 Unauthorized and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { refreshToken, setTokens, logout } = useAuthStore.getState();
        
        if (!refreshToken) {
          logout();
          return Promise.reject(error);
        }

        // Call refresh endpoint directly (don't use 'api' instance to avoid loops)
        const response = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refreshToken
        });

        const { accessToken, refreshToken: newRefresh } = response.data;
        setTokens(accessToken, newRefresh);

        // Update current failed request and retry
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axios(originalRequest);
        
      } catch (refreshError) {
        // Refresh token is expired or invalid
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
