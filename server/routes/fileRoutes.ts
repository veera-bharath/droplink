import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { FileController } from '../controllers/fileController';
import { TokenService } from '../services/tokenService';

const router = Router();

// Setup Multer for handling multipart/form-data uploads
// Temp storage in /uploads. The controller will sanitize and rename the file.
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB file size limit
  },
});

/**
 * Middleware to validate the session token.
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
    res.status(401).json({ error: 'Unauthorized: Invalid or missing session token.' });
  }
}

// Attach authentication middleware to all file routes
router.use(authenticateToken);

// Define Routes
router.get('/files', FileController.listFiles);
router.post('/upload', upload.array('files'), FileController.uploadFiles);
router.get('/download/:filename', FileController.downloadFile);
router.delete('/file/:filename', FileController.deleteFile);

export default router;
