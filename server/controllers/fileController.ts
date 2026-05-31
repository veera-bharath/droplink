import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { WebSocketService } from '../services/websocketService';

/**
 * Sanitizes a filename to make it safe for server storage and URL downloading.
 * It filters out risky path traversal sequences and replaces whitespace with underscores.
 */
export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const safeBase = base
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${safeBase}${ext}`;
}

export class FileController {
  private static _uploadsDir: string = process.env.DROPLINK_UPLOADS_DIR || path.join(process.cwd(), 'uploads');

  public static getUploadsDir(): string {
    if (!fs.existsSync(FileController._uploadsDir)) {
      fs.mkdirSync(FileController._uploadsDir, { recursive: true });
    }
    return FileController._uploadsDir;
  }

  public static setUploadsDir(newPath: string): void {
    FileController._uploadsDir = newPath;
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
  }

  /**
   * Returns a JSON array of all files inside /uploads.
   */
  public static listFiles(req: Request, res: Response): void {
    try {
      const uploadsDir = FileController.getUploadsDir();
      if (!fs.existsSync(uploadsDir)) {
        res.json([]);
        return;
      }

      const files = fs.readdirSync(uploadsDir);
      const fileList = files
        .map((filename) => {
          const filePath = path.join(uploadsDir, filename);
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return null;
          }
          
          const stats = fs.statSync(filePath);
          return {
            name: filename,
            size: stats.size, // in bytes
            date: stats.mtime.toISOString(), // upload date
          };
        })
        .filter((file) => file !== null);

      // Sort files: newest first
      fileList.sort((a, b) => new Date(b!.date).getTime() - new Date(a!.date).getTime());

      res.json(fileList);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve files: ' + error.message });
    }
  }

  /**
   * Process uploaded files, sanitizing their names and ensuring unique naming.
   */
  public static uploadFiles(req: Request, res: Response): void {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: 'No files were uploaded.' });
        return;
      }

      const savedNames: string[] = [];
      const uploadsDir = FileController.getUploadsDir();

      for (const file of uploadedFiles) {
        const sanitized = sanitizeFilename(file.originalname);
        const originalPath = file.path;
        const targetPath = path.join(uploadsDir, sanitized);

        // Keep naming unique to prevent silent overrides
        let uniquePath = targetPath;
        let uniqueName = sanitized;
        let counter = 1;
        
        while (fs.existsSync(uniquePath)) {
          const ext = path.extname(sanitized);
          const base = path.basename(sanitized, ext);
          uniqueName = `${base}_${counter}${ext}`;
          uniquePath = path.join(uploadsDir, uniqueName);
          counter++;
        }

        // Handle cross-device file moving (e.g., from D: workspace drive to C: Downloads drive)
        try {
          fs.renameSync(originalPath, uniquePath);
        } catch (renameError: any) {
          if (renameError.code === 'EXDEV') {
            fs.copyFileSync(originalPath, uniquePath);
            fs.unlinkSync(originalPath);
          } else {
            throw renameError;
          }
        }
        savedNames.push(uniqueName);
      }

      // Broadcast socket update
      WebSocketService.broadcast('file_update', { action: 'upload', files: savedNames });

      res.status(200).json({
        message: 'File(s) uploaded successfully!',
        files: savedNames,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to complete upload: ' + error.message });
    }
  }

  /**
   * Serves file for download.
   */
  public static downloadFile(req: Request, res: Response): void {
    try {
      const filename = path.basename(req.params.filename);
      const uploadsDir = FileController.getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.status(404).json({ error: 'File does not exist or has been removed.' });
        return;
      }

      res.download(filePath, filename);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to download file: ' + error.message });
    }
  }

  /**
   * Deletes a file and triggers a live update broadcast.
   */
  public static deleteFile(req: Request, res: Response): void {
    try {
      const filename = path.basename(req.params.filename);
      const uploadsDir = FileController.getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.status(404).json({ error: 'File does not exist or was already deleted.' });
        return;
      }

      fs.unlinkSync(filePath);

      // Broadcast socket update
      WebSocketService.broadcast('file_update', { action: 'delete', file: filename });

      res.status(200).json({ message: `File '${filename}' successfully deleted.` });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete file: ' + error.message });
    }
  }
}
