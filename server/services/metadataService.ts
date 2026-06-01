import fs from 'fs';
import path from 'path';
import { WebSocketService } from './websocketService';

export interface FileMetadata {
  selfDestruct: boolean;
  selfDestructType: 'download' | 'timer';
  selfDestructValue: number;
  downloadsLeft?: number;
  expiresAt?: string;
  createdAt: string;
}

export class MetadataService {
  private static getMetadataFilePath(): string {
    const uploadsDir = process.env.DROPLINK_UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return path.join(uploadsDir, '.metadata.json');
  }

  private static loadAll(): Record<string, FileMetadata> {
    const filePath = this.getMetadataFilePath();
    if (!fs.existsSync(filePath)) {
      return {};
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content || '{}');
    } catch (error: any) {
      console.error('[MetadataService] Failed to load metadata:', error.message);
      return {};
    }
  }

  private static saveAll(data: Record<string, FileMetadata>): void {
    const filePath = this.getMetadataFilePath();
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error: any) {
      console.error('[MetadataService] Failed to save metadata:', error.message);
    }
  }

  public static getMetadata(filename: string): FileMetadata | undefined {
    const data = this.loadAll();
    return data[filename];
  }

  public static setMetadata(filename: string, metadata: FileMetadata): void {
    const data = this.loadAll();
    data[filename] = metadata;
    this.saveAll(data);
  }

  public static deleteMetadata(filename: string): void {
    const data = this.loadAll();
    if (data[filename]) {
      delete data[filename];
      this.saveAll(data);
    }
  }

  /**
   * Initializes the background scavenger scanning daemon.
   */
  public static init(): void {
    console.log('[MetadataService] Initializing scavenger background routine...');
    // Run initial boot cleanup
    this.scavenge();
    
    // Start background scanner every 5 seconds
    setInterval(() => {
      this.scavenge();
    }, 5000);
  }

  /**
   * Scans all files in metadata and unlinks expired files.
   */
  public static scavenge(): void {
    try {
      const uploadsDir = process.env.DROPLINK_UPLOADS_DIR || path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) return;

      const data = this.loadAll();
      const now = new Date();
      let modified = false;

      for (const [filename, meta] of Object.entries(data)) {
        const filePath = path.join(uploadsDir, filename);

        // If file was deleted manually outside the app, remove metadata
        if (!fs.existsSync(filePath)) {
          delete data[filename];
          modified = true;
          continue;
        }

        // Check time expiration
        if (meta.selfDestruct && meta.selfDestructType === 'timer' && meta.expiresAt) {
          const expiresDate = new Date(meta.expiresAt);
          if (now >= expiresDate) {
            console.log(`[MetadataService] File '${filename}' has expired. Self-destructing...`);
            
            try {
              fs.unlinkSync(filePath);
            } catch (unlinkErr: any) {
              console.error(`[MetadataService] Failed to delete expired file '${filename}':`, unlinkErr.message);
            }

            delete data[filename];
            modified = true;

            // Broadcast real-time deletion update
            WebSocketService.broadcast('file_update', { action: 'delete', file: filename });
          }
        }
      }

      if (modified) {
        this.saveAll(data);
      }
    } catch (error: any) {
      console.error('[MetadataService] Error during scavenging:', error.message);
    }
  }
}
