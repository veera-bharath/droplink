const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, dialog, Notification } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
let pendingShellFiles = [];
let mainWindowReady = false;
const appIconPath = process.platform === 'win32'
  ? path.join(__dirname, 'assets', 'icon.ico')
  : path.join(__dirname, 'assets', 'icon.png');
const trayIconPath = path.join(__dirname, 'assets', 'icon-tray.png');

// Dynamic uploads folder in user's system Downloads folder
let uploadsDir = path.join(app.getPath('downloads'), 'DropLink');
// Dynamic log path in user AppData folder
const logPath = path.join(app.getPath('userData'), 'server.log');

/**
 * Extracts valid file paths from a process argv array, skipping flags and non-files.
 */
function getShellFilePaths(argv) {
  const startIdx = app.isPackaged ? 1 : 2;
  return argv.slice(startIdx).filter(arg => {
    if (arg.startsWith('-')) return false;
    try {
      return fs.statSync(arg).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Sends file paths to the renderer. Buffers them if the window is not ready yet.
 */
function sendShellFilesToRenderer(filePaths) {
  if (!filePaths.length) return;
  if (mainWindowReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shell-files', filePaths);
  } else {
    pendingShellFiles.push(...filePaths);
  }
}

/**
 * Spawns the background TypeScript-compiled Node.js Express server.
 */
function startBackgroundServer() {
  if (serverProcess) return;

  console.log('Spawning backend Express server...');
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'server', 'index.js')
    : path.join(__dirname, 'dist', 'server', 'index.js');
  const publicDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'public')
    : path.join(__dirname, 'public');
  
  // Create uploads folder recursively if missing
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Setup logging stream
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n--- Server Spawning: ${new Date().toISOString()} ---\n`);
  logStream.write(`Server Path: ${serverPath}\n`);
  logStream.write(`Public Dir: ${publicDir}\n`);
  logStream.write(`Uploads Dir: ${uploadsDir}\n`);

  // Pass dynamic uploads path and set NODE_ENV to production
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DROPLINK_UPLOADS_DIR: uploadsDir,
      DROPLINK_PUBLIC_DIR: publicDir
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout.on('data', (data) => {
    logStream.write(data);
  });

  serverProcess.stderr.on('data', (data) => {
    logStream.write(data);
  });

  serverProcess.on('error', (err) => {
    logStream.write(`Server process error: ${err.message}\n`);
    console.error('Server process error:', err);
  });

  serverProcess.on('exit', (code) => {
    logStream.write(`Server process exited with code ${code}\n`);
    console.log(`Server process exited with code ${code}`);
    serverProcess = null;
  });
}

/**
 * Programmatically stops the background Express server.
 */
function stopBackgroundServer() {
  if (serverProcess) {
    console.log('Shutting down background Express server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

/**
 * Creates a borderless loading splash screen.
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 450,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Read application icon and transpile to Base64 for data URL compatibility
  let iconBase64 = '';
  try {
    const iconFilePath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'assets', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(iconFilePath)) {
      iconBase64 = fs.readFileSync(iconFilePath).toString('base64');
    }
  } catch (err) {
    console.error('Failed to convert splash icon to base64:', err);
  }

  const logoHtml = iconBase64
    ? `<img src="data:image/png;base64,${iconBase64}" alt="DropLink Icon" style="width: 100%; height: 100%; object-fit: contain;">`
    : `<div style="width: 64px; height: 64px; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px; color: white;">
        <path d="M12 2v12M8 10l4 4 4-4M4 20h16"/>
      </svg></div>`;

  // Self-contained elegant dark loading screen HTML markup
  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background: #0d0e15;
          overflow: hidden;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Segoe UI', Roboto, sans-serif;
        }
        .splash-card {
          width: 100%;
          height: 100%;
          background: #0d0e15;
          color: #f1f3f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .logo {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        h2 {
          margin: 0 0 8px 0;
          font-size: 1.6rem;
          font-weight: 700;
          background: linear-gradient(to right, #fff, #c7d2fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          margin: 0;
          font-size: 0.9rem;
          color: #94a3b8;
        }
        .loader {
          width: 150px;
          height: 4px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 50px;
          margin-top: 24px;
          overflow: hidden;
          position: relative;
        }
        .loader-fill {
          height: 100%;
          width: 50%;
          background: #0066f5;
          border-radius: 50px;
          position: absolute;
          animation: load 1.5s infinite ease-in-out;
        }
        @keyframes load {
          0% { left: -50%; width: 30%; }
          50% { width: 40%; }
          100% { left: 100%; width: 30%; }
        }
      </style>
    </head>
    <body>
      <div class="splash-card">
        <div class="logo">
          ${logoHtml}
        </div>
        <h2>DropLink</h2>
        <p>Initializing local network servers...</p>
        <div class="loader">
          <div class="loader-fill"></div>
        </div>
      </div>
    </body>
    </html>
  `;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

/**
 * Creates the primary application window.
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    center: true,
    show: false,
    title: 'DropLink',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load local Express URL
  mainWindow.loadURL('http://127.0.0.1:3000');

  // Hide custom default application menu, leaving basic shortcuts active
  const menuTemplate = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
    mainWindowReady = true;
    if (pendingShellFiles.length > 0) {
      mainWindow.webContents.send('shell-files', pendingShellFiles);
      pendingShellFiles = [];
    }
  });

  // Minimize to System Tray when close is clicked instead of closing the background server
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      
      // Notify user via tray balloon on Windows
      if (process.platform === 'win32' && tray) {
        tray.displayBalloon({
          title: 'DropLink Background Syncing Active',
          content: 'The desktop app has minimized to the system tray. Wi-Fi file sharing continues to operate.',
          iconType: 'info'
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Creates the Windows System Tray interface.
 */
function createSystemTray() {
  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon);
  tray.setToolTip('DropLink File Transfer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open DropLink Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Open Transferred Files Folder',
      click: () => {
        if (fs.existsSync(uploadsDir)) {
          shell.openPath(uploadsDir);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit DropLink Completely',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Restore main window on Tray double-click
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * TCP Ping-check helper that retries until Express is fully initialized.
 */
function pingServerAndLoadUI(retries = 30) {
  if (retries <= 0) {
    console.error('Server failed to start in time. Loading fallback window.');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
    if (!mainWindow) {
      mainWindow = new BrowserWindow({
        width: 1050,
        height: 750,
        center: true,
        title: 'DropLink',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                margin: 0;
                font-family: Segoe UI, sans-serif;
                background: #0d0e15;
                color: #f1f3f9;
                display: grid;
                place-items: center;
                min-height: 100vh;
              }
              .card {
                max-width: 560px;
                padding: 32px;
                border-radius: 20px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                box-shadow: 0 20px 50px rgba(0,0,0,0.45);
              }
              h1 { margin: 0 0 12px; font-size: 24px; }
              p { margin: 0; line-height: 1.6; color: #cbd5e1; }
              code { color: #93c5fd; }
            </style>
          </head>
          <body>
             <div class="card">
               <h1>DropLink could not start the local server</h1>
               <p>The background server failed to initialize in time.</p>
               <p style="margin-top: 16px;">You can inspect the exact error log at:</p>
               <code style="display: block; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; margin-top: 8px; word-break: break-all; font-family: monospace; font-size: 0.85rem; border: 1px solid rgba(255,255,255,0.1);">${logPath}</code>
             </div>
          </body>
        </html>
      `)}`);
      mainWindow.show();
      // Clear any buffered shell files — the app failed to start so uploads are impossible
      pendingShellFiles = [];
    }
    return;
  }

  http.get('http://127.0.0.1:3000/config', (res) => {
    if (res.statusCode === 200) {
      console.log('Local Express server is fully initialized!');
      createMainWindow();
    } else {
      setTimeout(() => pingServerAndLoadUI(retries - 1), 200);
    }
  }).on('error', () => {
    setTimeout(() => pingServerAndLoadUI(retries - 1), 200);
  });
}

// -------------------------------------------------------------
// APP LIFECYCLE
// -------------------------------------------------------------

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Focus existing window if a duplicate app launch is attempted
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    // Forward any file paths passed by the shell context menu
    sendShellFilesToRenderer(getShellFilePaths(commandLine));
  });

  app.on('ready', () => {
    // Capture any file paths passed on the initial launch (context menu when app was closed)
    const initialFiles = getShellFilePaths(process.argv);
    if (initialFiles.length > 0) {
      pendingShellFiles.push(...initialFiles);
    }

    createSplashWindow();
    startBackgroundServer();
    createSystemTray();

    // Begin ping checks
    pingServerAndLoadUI();
  });
}

// IPC listener to securely open Windows File Explorer on Downloads folder
ipcMain.on('open-downloads', () => {
  if (fs.existsSync(uploadsDir)) {
    shell.openPath(uploadsDir);
  } else {
    fs.mkdirSync(uploadsDir, { recursive: true });
    shell.openPath(uploadsDir);
  }
});

// IPC handler to open native directory picker and set custom uploads directory
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Save Directory',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  const selectedPath = result.filePaths[0];
  uploadsDir = selectedPath;
  
  // Ensure the new directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Notify background Express server process
  if (serverProcess && serverProcess.connected) {
    serverProcess.send({ type: 'SET_UPLOADS_DIR', path: uploadsDir });
  }

  return uploadsDir;
});

// IPC listener for triggering native OS desktop notifications
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title,
      body: body,
      icon: appIconPath
    });

    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();
  }
});

// IPC handler that reads a local file from disk and returns its content to the renderer.
// Used by the shell context menu flow to convert absolute paths into uploadable File objects.
ipcMain.handle('read-file-for-upload', async (event, filePath) => {
  const stat = await fs.promises.stat(filePath);
  const MAX = 2 * 1024 * 1024 * 1024;
  if (stat.size > MAX) {
    throw new Error(`File exceeds the 2 GB upload limit (${(stat.size / 1e9).toFixed(1)} GB).`);
  }
  const buffer = await fs.promises.readFile(filePath);
  // Slice to get a standalone ArrayBuffer (Node Buffer may share a pool)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    arrayBuffer,
    name: path.basename(filePath),
    size: stat.size,
    lastModified: stat.mtimeMs,
    type: 'application/octet-stream'
  };
});

// App Exit Handler
app.on('will-quit', () => {
  stopBackgroundServer();
  if (tray) {
    tray.destroy();
  }
});

app.on('window-all-closed', () => {
  // Keeping app active in background tray even when all windows are closed on Windows/macOS
  if (process.platform !== 'darwin' && !isQuitting) {
    // minimized to tray
  } else if (isQuitting) {
    app.quit();
  }
});
