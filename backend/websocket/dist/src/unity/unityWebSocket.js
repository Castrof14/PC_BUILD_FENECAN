import WebSocket from 'ws';
export function connectToBackend(url = process.env.BACKEND_URL ?? 'ws://localhost:8080') {
    return new WebSocket(url);
}
//# sourceMappingURL=unityWebSocket.js.map