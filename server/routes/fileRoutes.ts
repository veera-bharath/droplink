import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { FileController } from '../controllers/fileController';
import { TokenService } from '../services/tokenService';

const router = Router();

// Multer storage that resolves tempDir at request time so runtime save-directory
// changes (via Electron directory picker) are always reflected.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(FileController.getUploadsDir(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB file size limit
  },
});

/**
 * Middleware to validate the session token or custom password.
 * It checks the 'X-Session-Token' header, 'Authorization' header, or 'token' query parameter.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  // Check header 'x-session-token'
  let token = req.headers['x-session-token'];

  // Fallback to standard Authorization Bearer header
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  // Fallback to query parameter (especially useful for downloading files via direct anchor tags)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (TokenService.validateToken(token)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing security credentials.' });
  }
}

// Public Password Status Check Route (Exempt from authentication)
router.get('/password-config', (req: Request, res: Response) => {
  res.json({ isPasswordSet: TokenService.isPasswordEnabled() });
});

// Attach authentication middleware to all subsequent routes
router.use(authenticateToken);

// Protected Password Configuration Route
router.post('/password-config/set', (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (password !== undefined) {
      if (password === null || password.trim() === '') {
        TokenService.setCustomPassword(null);
        res.status(200).json({ message: 'Custom password disabled successfully.' });
      } else {
        const cleanPassword = password.trim();
        if (cleanPassword.length < 4) {
          res.status(400).json({ error: 'Password must be at least 4 characters long.' });
          return;
        }
        TokenService.setCustomPassword(cleanPassword);
        res.status(200).json({ message: 'Custom password updated successfully.' });
      }
    } else {
      res.status(400).json({ error: 'Password field is missing.' });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update password: ' + error.message });
  }
});

// Define Routes
router.get('/files', FileController.listFiles);
router.post('/upload', upload.array('files'), FileController.uploadFiles);
router.get('/download/:filename', FileController.downloadFile);
router.get('/preview/:filename', FileController.previewFile);
router.delete('/file/:filename', FileController.deleteFile);

export default router;

