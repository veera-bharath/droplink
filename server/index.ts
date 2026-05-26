import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { exec } from 'child_process';
import QRCode from 'qrcode';
import fileRouter from './routes/fileRoutes';
import { NetworkService } from './services/networkService';
import { TokenService } from './services/tokenService';
import { WebSocketService } from './services/websocketService';

const app = express();
const PORT = 3000;

// Enable CORS for easy mobile-to-PC resource access
app.use(cors());
app.use(express.json());

// Resolve static assets supporting packaged standalone binaries (.exe)
const isPackaged = typeof (process as any).pkg !== 'undefined';
const staticPath = isPackaged
  ? path.join(__dirname, '../public') // inside virtual package relative to dist/server
  : path.join(process.cwd(), 'public'); // dev mode/normal node runtime

app.use(express.static(staticPath));

// Generate and configure server-wide security session token
const token = TokenService.generateSessionToken();
const localIp = NetworkService.getLocalIp();

/**
 * GET /config
 * Unauthenticated config endpoint.
 * Auto-shares the token ONLY if the request originates from localhost (the PC hosting the server).
 * Pre-generates the QR Code for the connection URL to optimize client loading.
 */
app.get('/config', async (req, res) => {
  try {
    const clientIp = req.ip || '';
    const isLocalhost = 
      clientIp === '127.0.0.1' || 
      clientIp === '::1' || 
      clientIp === '::ffff:127.0.0.1' ||
      req.hostname === 'localhost' ||
      req.hostname === '127.0.0.1';

    const connectionUrl = `http://${localIp}:${PORT}/?token=${token}`;
    const qrCodeBase64 = await QRCode.toDataURL(connectionUrl);

    res.json({
      ip: localIp,
      port: PORT,
      token: isLocalhost ? token : null, // Securely hide from external Wi-Fi scanners
      connectionUrl,
      qrCode: qrCodeBase64,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate connection config: ' + error.message });
  }
});

// Mount file management routes directly
app.use('/', fileRouter);

// Fallback to serving the SPA client for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Create base HTTP server to hook WebSockets and Express together
const server = http.createServer(app);

// Initialize real-time WebSocket syncing
WebSocketService.init(server);

// Boot the server
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('🚀 DROPLINK SERVER STARTED SUCCESSFULLY');
  console.log('======================================================');
  console.log(`💻 Local Host Access: http://localhost:${PORT}`);
  console.log(`📱 Wi-Fi LAN Access:  http://${localIp}:${PORT}`);
  console.log(`🔑 Security Token:   ${token}`);
  console.log('======================================================');
  console.log(`🔗 Scanning QR Code on UI auto-authenticates mobile devices!`);
  console.log('======================================================\n');

  // Auto-open browser on startup for non-technical users
  const connectionUrl = `http://localhost:${PORT}`;
  const startCommand = process.platform === 'win32'
    ? `start ${connectionUrl}`
    : process.platform === 'darwin'
      ? `open ${connectionUrl}`
      : `xdg-open ${connectionUrl}`;
      
  exec(startCommand, (err) => {
    if (err) console.error('Failed to auto-open browser:', err.message);
  });
});
