// Vite exposes env variables via import.meta.env
const rawEnvUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// 1. Force API_BASE_URL to ALWAYS end with /api (Fixes the .env mismatch)
export const API_BASE_URL = rawEnvUrl.endsWith('/api')
  ? rawEnvUrl
  : `${rawEnvUrl.replace(/\/$/, '')}/api`;

// 2. BACKEND_URL safely strips the /api for your Images
export const BACKEND_URL = API_BASE_URL.slice(0, -4);

// Helper to make full URLs easily
export const getApiUrl = (endpoint) => {
  // Strip leading slash if present so we don't get double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
};