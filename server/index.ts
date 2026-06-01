import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import QRCode from 'qrcode';
import fileRouter from './routes/fileRoutes';
import { FileController } from './controllers/fileController';
import { NetworkService } from './services/networkService';
import { TokenService } from './services/tokenService';
import { WebSocketService } from './services/websocketService';
import { MetadataService } from './services/metadataService';

const app = express();
const PORT = 3000;

// Enable CORS for easy mobile-to-PC resource access
app.use(cors());
app.use(express.json());

// Resolve static assets from the path provided by the Electron main process.
const staticPath =
  process.env.DROPLINK_PUBLIC_DIR ||
  path.join(process.cwd(), 'public');

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

    const activeToken = TokenService.isPasswordEnabled()
      ? TokenService.getCustomPassword()
      : TokenService.getSessionToken();

    // Token-bearing URL and QR code are only generated for the localhost host UI.
    // External callers receive the bare server address so they can display it,
    // but cannot extract credentials from the response.
    const tokenConnectionUrl = `http://${localIp}:${PORT}/?token=${activeToken}`;
    const baseConnectionUrl = `http://${localIp}:${PORT}`;

    const qrCodeBase64 = isLocalhost
      ? await QRCode.toDataURL(tokenConnectionUrl)
      : null;

    res.json({
      ip: localIp,
      port: PORT,
      token: isLocalhost ? activeToken : null,
      connectionUrl: isLocalhost ? tokenConnectionUrl : baseConnectionUrl,
      qrCode: qrCodeBase64,
      uploadsDir: isLocalhost ? FileController.getUploadsDir() : null,
      isPasswordSet: TokenService.isPasswordEnabled(),
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

// Initialize metadata tracking scavenger daemon
MetadataService.init();

// Listen for background child-process IPC messages to update uploads directory at runtime
process.on('message', (message: any) => {
  if (message && message.type === 'SET_UPLOADS_DIR' && typeof message.path === 'string') {
    console.log(`[IPC] Updating active uploads directory to: ${message.path}`);
    FileController.setUploadsDir(message.path);
  }
});

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
});
