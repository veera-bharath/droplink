const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
const appIconPath = process.platform === 'win32'
  ? path.join(__dirname, 'assets', 'icon.ico')
  : path.join(__dirname, 'assets', 'icon.png');
const trayIconPath = path.join(__dirname, 'assets', 'icon-tray.png');

// Dynamic uploads folder in user's system Downloads folder
const uploadsDir = path.join(app.getPath('downloads'), 'DropLink');

/**
 * Spawns the background TypeScript-compiled Node.js Express server.
 */
function startBackgroundServer() {
  if (serverProcess) return;

  console.log('Spawning backend Express server...');
  const serverPath = path.join(__dirname, 'dist/server/index.js');
  
  // Create uploads folder recursively if missing
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Pass dynamic uploads path and set NODE_ENV to production
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DROPLINK_UPLOADS_DIR: uploadsDir
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  });

  serverProcess.on('error', (err) => {
    console.error('Server process error:', err);
  });

  serverProcess.on('exit', (code) => {
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
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Self-contained elegant dark glassmorphic loading screen HTML markup
  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Roboto, sans-serif;
          background: rgba(13, 14, 21, 0.95);
          color: #f1f3f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
        }
        .logo {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
          margin-bottom: 20px;
        }
        .logo svg {
          width: 32px;
          height: 32px;
          color: white;
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
          background: #6366f1;
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
      <div class="logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v12M8 10l4 4 4-4M4 20h16"/>
        </svg>
      </div>
      <h2>DropLink</h2>
      <p>Initializing local network servers...</p>
      <div class="loader">
        <div class="loader-fill"></div>
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
  mainWindow.loadURL('http://localhost:3000');

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
    app.quit();
    return;
  }

  http.get('http://localhost:3000/config', (res) => {
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
  app.on('second-instance', () => {
    // Focus existing window if a duplicate app launch is attempted
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('ready', () => {
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
