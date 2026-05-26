import { IncomingMessage } from 'http';
import { Server } from 'ws';
import { TokenService } from './tokenService';

export class WebSocketService {
  private static wss: Server | null = null;

  /**
   * Initializes the WebSocket server, bound to the Express/HTTP server.
   */
  public static init(server: any): Server {
    this.wss = new Server({ noServer: true });

    // Handle standard server upgrade to capture and validate token in the query parameters
    server.on('upgrade', (request: IncomingMessage, socket: any, head: any) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token || !TokenService.validateToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.wss?.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws) => {
      // Send a heartbeat or welcome message
      ws.send(JSON.stringify({ type: 'connected', payload: { message: 'Real-time synchronization established.' } }));
    });

    return this.wss;
  }

  /**
   * Broadcasts a JSON event to all validated, connected clients.
   */
  public static broadcast(type: string, payload: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ type, payload });
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }
}
