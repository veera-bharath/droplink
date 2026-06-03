# DropLink 🚀

[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)](https://github.com/veera-bharath/droplink)
[![Framework](https://img.shields.io/badge/framework-Electron-violet.svg)](https://electronjs.org)
[![Backend](https://img.shields.io/badge/backend-Node.js%20%7C%20Express-green.svg)](https://nodejs.org)
[![Language](https://img.shields.io/badge/language-TypeScript%20%7C%20JavaScript-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

DropLink is a modern, high-performance, and beautifully styled local network file sharing desktop application. It allows you to instantly and securely transfer massive files (up to **2GB**) between your mobile devices and your PC over the same local Wi-Fi network—**consuming zero internet bandwidth and with zero cloud dependency**.

### 📦 [Download Latest Release for Windows (v1.1.0)](https://github.com/veera-bharath/droplink/releases/download/v1.1.0/DropLink-Setup-1.1.0.exe)

---

## ✨ Features

- **🚀 Native Desktop App Shell**: Wrapped in a modern, borderless Electron wrapper for a native Windows software feel.
- **🛡️ Double-Ended Session Security**: Auto-generates a secure, 6-character uppercase security token upon launch. Direct scans of the QR code pre-authenticate mobile devices instantly.
- **🔑 Persistent Password Protection**: Set a persistent security password in the Preferences panel. Manual connections can use either the active 6-character session token or your custom password.
- **💻 Host Auto-Login**: The app automatically logs you in when opened on `127.0.0.1` (the hosting PC), but requires verification for external local Wi-Fi clients.
- **📂 Native Windows Downloads Directory**: Uploaded files automatically stream directly into your local `C:\Users\<Name>\Downloads\DropLink` directory rather than hiding in temporary app caches.
- **📁 Custom Save Directory**: Change the upload destination at runtime from the Preferences panel — pick any folder on any drive without restarting the app.
- **🔌 EXDEV Multi-Drive Fallback**: Robust, enterprise-grade handling for cross-device filesystem moves. If your project is hosted on a secondary partition (e.g. `D:\`), uploads are cleanly copied and unlinked across volumes onto your primary `C:\` drive Downloads folder.
- **🔄 Live WebSocket Sync**: A lightweight, native WebSocket connection keeps all connected devices updated in real-time. Files uploaded or deleted on your phone immediately appear or disappear on your PC without page refreshes.
- **⚡ Parallel Upload Queue**: Upload up to 2 files simultaneously with a live progress queue showing per-file speed, ETA, and individual cancel controls.
- **🔍 Inline File Preview**: Preview images, videos, audio, PDFs, and code files directly inside the app via a full-screen lightbox — no download required.
- **💣 Self-Destructing Transfers**: Mark any file to auto-delete after a set number of downloads or after a countdown timer expires.
- **🖱️ Windows Explorer Context Menu**: Right-click any file in Windows Explorer and choose **"Share with DropLink"** to instantly queue it for transfer — no drag-and-drop required.
- **🔔 Desktop & Browser Notifications**: Receive native OS notifications (Electron) or browser notifications (mobile) when a new file arrives from a connected device.
- **🎛️ Windows System Tray Minimizing**: Closing the window minimizes the application into your Windows System Tray next to your clock, keeping your file-sync server running continuously in the background.
- **⌛ Solid Splash Screen & Port Pinging**: Auto-spawns a modern solid rectangular loading splash screen displaying the official logo and a brand blue loader, running an active `127.0.0.1` TCP-ping loop to bypass loopback DNS hostname resolution conflicts (IPv4 vs. IPv6 `::1`) on Windows.
- **🎨 Premium Blue Glassmorphic Design**: Curated HSL brand blue accents, responsive fluid grid layouts, modern inline SVG vector headers, and smooth micro-animations.

---

## 📁 Project Structure

```text
/project-root
  ├── main.js                 # Electron Main Process (Lifecycle, processes, & system tray)
  ├── preload.js              # Secure Context Bridge (contextIsolation & IPC messaging)
  ├── package.json            # Scripts, dependencies, and electron-builder NSIS config
  ├── tsconfig.json           # TS Compiler options targeting ES2022
  ├── .gitignore              # Ignores node_modules, dist, dist-electron, and uploads
  ├── public/                 # Vanilla Single-Page Frontend assets
  │   ├── index.html          # Dashboard Markup & Google Fonts
  │   ├── style.css           # Custom Glassmorphic Styling & mobile responsive rules
  │   └── app.js              # Real-time WebSocket sync, speed counters, and AJAX uploads
  └── server/                 # TypeScript Backend
      ├── index.ts            # Server entrypoint (HTTP, Express, WS, and QR generation)
      ├── controllers/
      │   └── fileController.ts # Lister, downloader, unlinker, & EXDEV copy handlers
      ├── routes/
      │   └── fileRoutes.ts   # Router mapping, multer setup, and token security checks
      └── services/
          ├── networkService.ts   # Automated physical LAN Wi-Fi IPv4 discovery
          ├── tokenService.ts     # Generates and validates session tokens; manages persistent password
          ├── websocketService.ts # Handles socket connection handshakes and broadcasts
          └── metadataService.ts  # Per-file self-destruct metadata; scavenger daemon runs every 5s
```

---

## 🚀 Getting Started

### 📋 Prerequisites
Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18.x or higher recommended)
- [Git](https://git-scm.com/)

---

### 💻 Running in Development
1. Clone this repository locally:
   ```bash
   git clone https://github.com/veera-bharath/droplink.git
   cd droplink
   ```
2. Install all development and core dependencies:
   ```bash
   npm install
   ```
3. Boot the TypeScript compiler and launch the Electron application:
   ```bash
   npm run dev
   ```
   *Your web browser will automatically open, and the desktop shell will display the dashboard pre-authenticated.*

---

### 📦 Packaging into a Standalone `.exe` Installer
To package DropLink into a single, double-clickable, redistributable Windows setup wizard that can be shared with non-technical users:

1. Compile the production installer:
   ```bash
   npm run build
   ```
2. The output installer will be generated in the newly created **`dist-electron/`** folder:
   - **`DropLink-Setup-1.1.0.exe`**: Double-click this file to run a standard Windows Installation Wizard, which automatically places shortcuts on your Desktop and Start Menu and provides a clean uninstaller in your Windows Control Panel.

---

## ⚡ Standalone Web/CLI Server Mode (No Electron)
If you prefer to run DropLink as a lightweight command-line tool or host it in a headless Linux server environment without the Electron GUI wrapper, you can run these standard scripts:

- **Launch Dev Server**:
  ```bash
  npm run server:dev
  ```
- **Compile TS Server to JS**:
  ```bash
  npm run server:build
  ```
- **Start Compiled JS Server**:
  ```bash
  npm run server:start
  ```
  *When running in standalone mode, uploaded files will be saved directly into `/uploads` next to the workspace root.*

---

## 🛡️ Security Model
1. **Network Boundary**: DropLink only binds to your local LAN network adapter (e.g. `192.168.1.x`) and `127.0.0.1`. It does not listen to public ports or wide-area connections.
2. **Key Verification**: All critical endpoints (`/files`, `/upload`, `/file/*`, `/download/*`) require either the active 6-character dynamic session token or your custom configured persistent password. This credential must be passed in the `X-Session-Token` header or `?token=...` query string.
3. **Localhost Exemption**: Requests originating from `localhost` or `127.0.0.1` are automatically authorized to fetch the token inside `/config` so the hosting PC user has zero-typing frictionless access.
4. **Isolate Renderers**: Electron window context isolation is enabled, ensuring web pages cannot execute direct arbitrary Node.js scripts on your desktop.

---

## 📄 License
This project is licensed under the MIT License. Feel free to use, modify, and distribute it. Made with ❤️ for developers and local Wi-Fi transfer comfort.
