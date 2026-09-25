import WebSocket from 'ws';

export function connectToBackend(url = process.env.BACKEND_URL ?? 'ws://localhost:8080'): WebSocket {
  return new WebSocket(url);
}
