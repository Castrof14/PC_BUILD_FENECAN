import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT ?? 8080);
const server = new WebSocketServer({ port });
const clients = new Set<WebSocket>();

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

server.on('connection', (socket, request) => {
  clients.add(socket);
  const clientId = request.headers['sec-websocket-key'] ?? 'unknown';

  sendJson(socket, {
    type: 'connected',
    clientId,
    message: 'WebSocket connection established',
  });

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString()) as Record<string, unknown>;
      const response = {
        type: 'message',
        receivedAt: new Date().toISOString(),
        ...message,
      };

      for (const client of clients) {
        sendJson(client, response);
      }
    } catch {
      sendJson(socket, {
        type: 'error',
        message: 'Messages must be valid JSON.',
      });
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
  });

  socket.on('error', () => {
    clients.delete(socket);
  });
});

server.on('listening', () => {
  console.log(`WebSocket server listening on ws://localhost:${port}`);
});

server.on('error', (error) => {
  console.error('WebSocket server error:', error);
  process.exitCode = 1;
});
