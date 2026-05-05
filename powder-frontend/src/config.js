// Vite exposes env variables via import.meta.env
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Helper to make full URLs easily
export const getApiUrl = (endpoint) => {
  // Strip leading slash if present so we don't get double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // If API_BASE_URL is just "/api", this creates "/api/notes"
  if (API_BASE_URL.startsWith('/')) {
    return `${API_BASE_URL}/${cleanEndpoint}`;
  }

  // Otherwise it creates "http://localhost:8000/api/notes"
  return `${API_BASE_URL}/${cleanEndpoint}`;
};

// We also need the raw backend URL for images and the login redirect
// If API_BASE_URL is "/api", the base is just "" (current domain)
export const BACKEND_URL = API_BASE_URL.startsWith('/') ? '' : API_BASE_URL;