/**
 * Dynamic Backend URL Configuration
 * 
 * Handles different environments:
 * - Preview: Uses REACT_APP_BACKEND_URL from .env
 * - Custom Domain (deployed): Uses same origin since backend is served from same domain
 * - Localhost: Uses REACT_APP_BACKEND_URL from .env
 */

const getBackendUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  
  // If we're on a preview domain, use the env variable
  if (window.location.hostname.includes('preview.emergentagent.com')) {
    return envUrl;
  }
  
  // For custom domains (deployed), use same origin since backend is served from same domain
  if (!window.location.hostname.includes('localhost')) {
    return window.location.origin;
  }
  
  // Fallback to env variable (localhost development)
  return envUrl;
};

export const BACKEND_URL = getBackendUrl();
export const API = `${BACKEND_URL}/api`;
