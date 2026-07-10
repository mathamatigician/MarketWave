const hostname = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const API_URL = `${protocol}//${hostname}:8000`;
export const WS_URL = `${wsProtocol}//${hostname}:8000`;
