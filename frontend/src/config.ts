const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// In production these are baked in at build time (see frontend/Dockerfile).
// Local dev leaves them unset and falls back to today's derived-from-hostname
// behavior, unchanged.
export const API_URL = import.meta.env.VITE_API_URL || `${protocol}//${hostname}:8000`;
export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${hostname}:8000`;
