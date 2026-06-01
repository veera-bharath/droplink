import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { WebSocketService } from '../services/websocketService';
import { MetadataService } from '../services/metadataService';

// Extensions browsers render as active content — served as text/plain in previewFile
const ACTIVE_CONTENT_EXTS = new Set(['.html', '.htm', '.svg', '.xhtml', '.xml', '.mhtml', '.mht']);

/**
 * Sanitizes a filename to make it safe for server storage and URL downloading.
 * It filters out risky path traversal sequences and replaces whitespace with underscores.
 */
export function sanitizeFilename(filename: string): string {
  const rawExt = path.extname(filename);
  const base = path.basename(filename, rawExt);
  const safeBase = base
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const safeExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
  return `${safeBase}${safeExt}`;
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
    process.env.DROPLINK_UPLOADS_DIR = newPath;
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
          // Ignore hidden files (e.g. .metadata.json, .DS_Store)
          if (filename.startsWith('.')) {
            return null;
          }

          const filePath = path.join(uploadsDir, filename);
          let stats: fs.Stats;
          try {
            stats = fs.statSync(filePath);
          } catch {
            return null;
          }
          if (!stats.isFile()) {
            return null;
          }
          const meta = MetadataService.getMetadata(filename);

          return {
            name: filename,
            size: stats.size, // in bytes
            date: stats.mtime.toISOString(), // upload date
            selfDestruct: meta?.selfDestruct || false,
            selfDestructType: meta?.selfDestructType || null,
            selfDestructValue: meta?.selfDestructValue || null,
            downloadsLeft: meta?.downloadsLeft ?? null,
            expiresAt: meta?.expiresAt || null,
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

      const isSelfDestruct = req.body.selfDestruct === 'true';
      const selfDestructType = req.body.selfDestructType as 'download' | 'timer';
      const selfDestructValue = req.body.selfDestructValue ? parseInt(req.body.selfDestructValue, 10) : 0;

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

        // Save self-destruct metadata if applicable
        if (isSelfDestruct) {
          const createdAt = new Date();
          const expiresAt = selfDestructType === 'timer'
            ? new Date(createdAt.getTime() + selfDestructValue * 60 * 1000).toISOString()
            : undefined;

          MetadataService.setMetadata(uniqueName, {
            selfDestruct: true,
            selfDestructType,
            selfDestructValue,
            downloadsLeft: selfDestructType === 'download' ? 1 : undefined,
            expiresAt,
            createdAt: createdAt.toISOString(),
          });
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

      // Decrement the download counter synchronously before starting the transfer.
      // Doing this before res.download() prevents concurrent requests from both
      // reading downloadsLeft > 0 and both succeeding. On transfer error the
      // counter is restored so a failed delivery doesn't permanently brick the file.
      let shouldDeleteAfter = false;
      let decremented = false;
      const meta = MetadataService.getMetadata(filename);
      if (meta && meta.selfDestruct && meta.selfDestructType === 'download') {
        const currentLeft = meta.downloadsLeft !== undefined ? meta.downloadsLeft : 1;
        const left = currentLeft - 1;
        if (left < 0) {
          res.status(410).json({ error: 'File download limit has been reached.' });
          return;
        }
        decremented = true;
        if (left === 0) {
          shouldDeleteAfter = true;
          MetadataService.setMetadata(filename, { ...meta, downloadsLeft: 0 });
        } else {
          MetadataService.setMetadata(filename, { ...meta, downloadsLeft: left });
        }
      }

      res.download(filePath, filename, (err) => {
        if (err) {
          console.error(`[FileController] Error during file download for '${filename}':`, err.message);
          // Restore counter so the file remains downloadable after a failed transfer
          if (decremented && meta) {
            MetadataService.setMetadata(filename, meta);
          }
          return;
        }

        if (shouldDeleteAfter) {
          try {
            console.log(`[FileController] File '${filename}' download-limit reached. Self-destructing...`);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            MetadataService.deleteMetadata(filename);
            WebSocketService.broadcast('file_update', { action: 'delete', file: filename });
          } catch (deleteError: any) {
            console.error(`[FileController] Self-destruct delete error:`, deleteError.message);
          }
        } else if (decremented) {
          WebSocketService.broadcast('file_update', { action: 'upload', files: [filename] });
        }
      });
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
      MetadataService.deleteMetadata(filename);

      // Broadcast socket update
      WebSocketService.broadcast('file_update', { action: 'delete', file: filename });

      res.status(200).json({ message: `File '${filename}' successfully deleted.` });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete file: ' + error.message });
    }
  }

  /**
   * Serves file inline for browser previews.
   */
  public static previewFile(req: Request, res: Response): void {
    try {
      const filename = path.basename(req.params.filename);
      const uploadsDir = FileController.getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.status(404).json({ error: 'File does not exist or has been removed.' });
        return;
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');

      const ext = path.extname(filename).toLowerCase();
      if (ACTIVE_CONTENT_EXTS.has(ext)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to serve preview: ' + err.message });
          } else {
            res.destroy();
          }
        });
        stream.pipe(res);
      } else {
        res.sendFile(filePath);
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to serve preview: ' + error.message });
    }
  }
}
