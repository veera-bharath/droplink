# GEMINI Codebase Memory — DropLink 🧠

Welcome, fellow AI agent or developer! This memory file is initialized to provide an instant, deep-dive understanding of **DropLink**'s architecture, engineering decisions, CLI commands, and resolved operating system caveats.

---

## 🎯 Project Overview & Core Intent

DropLink is a modern, high-performance, and beautifully styled local network file sharing desktop utility. It bridges a **Node.js Express + WebSockets server** inside an **Electron wrapper**, allowing local clients (laptops, phones, tablets) on the same Wi-Fi network to transfer massive files (up to **2GB**) directly onto the host PC.
*   **Zero Internet Dependency**: Operations run completely offline over local TCP sockets.
*   **Zero-Config Desktop Shell**: Launches a borderless splash loading screen, runs a pinger loop to verify Express readiness, and presents the GUI pre-authenticated without requiring terminals.

---

## 📁 Technical Architecture & MVC Layout

```text
/project-root
  ├── main.js                  # Electron Main Process (Lifecycles, subprocess forks, & tray)
  ├── preload.js               # Secure Context Bridge (contextIsolation & IPC navigation)
  ├── package.json             # Build configurations & electron-builder metadata
  ├── tsconfig.json            # TypeScript server compiler options (ES2022 / CommonJS)
  ├── public/                  # SPA Web Frontend (served by Express)
  │   ├── index.html           # Dark-glassmorphic SPA Dashboard markup
  │   ├── style.css            # Responsive styles, scrollbars, & mobile viewports
  │   └── app.js               # WebSockets syncing, speed gauges, and XHR uploads
  └── server/                  # TS Backend (forked by main.js)
      ├── index.ts             # Express startup, QR builder, & http+ws server boot
      ├── controllers/
      │   └── fileController.ts# List, download, delete, & EXDEV volume copy handlers
      ├── routes/
      │   └── fileRoutes.ts    # Multer file size limits (2GB) & token middlewares
      └── services/
          ├── networkService.ts# Active Wi-Fi/Ethernet IPv4 autodiscovery
          ├── tokenService.ts  # Session token states (6-character uppercase alpha)
          └── websocketService.ts# Port upgrades & file update sync broadcasts
```

---

## ⚙️ Key Environment & Directory Configs

1.  **Dynamic Upload Directory**:
    *   **Stand-alone Server Mode**: Saves files inside `path.join(process.cwd(), 'uploads')` (the root project directory).
    *   **Electron Desktop Mode**: Spawns with `process.env.DROPLINK_UPLOADS_DIR` set to the user's OS downloads folder: `C:\Users\<Name>\Downloads\DropLink`.
2.  **Explicit Host Interface Binding**:
    The backend binds explicitly to `0.0.0.0` (all network cards) inside `server/index.ts` to allow incoming local Wi-Fi packets to reach port 3000:
    ```typescript
    server.listen(PORT, '0.0.0.0', () => { ... });
    ```
3.  **Localhost Auto-Authorization**:
    The `/config` endpoint evaluates `req.ip`. If the request originates from `127.0.0.1` / `::1` (the hosting PC), it auto-shares the session token to the browser, allowing friction-free access on the PC, while withholding the token from external Wi-Fi clients.

---

## 📜 Core CLI & Shell Scripts

All core operations are mapped cleanly in `package.json`:

### 1. Electron Desktop GUI (Development)
TypeScript transpiles TS server code to JS, then instantly boots the Electron developer shell locally (without packaging):
```bash
npm run dev
```

### 2. Standalone Installer Packaging (Production)
Compiles TypeScript backend and uses `electron-builder` with an NSIS compiler to package files (`dist/`, `public/`, `main.js`, `preload.js`) into a standalone Windows Setup Wizard:
```bash
npm run build
```
*Output: `dist-electron/DropLink Setup 1.0.0.exe`*

### 3. Headless CLI / Server Execution
To run DropLink as a lightweight command-line tool (e.g. on a headless Linux server or background daemon without GUI):
- **Start Dev CLI**: `npm run server:dev`
- **Compile TS to JS**: `npm run server:build`
- **Start Compiled JS Server**: `npm run server:start`

---

## 💡 Engineering Insights & Lessons Learned (Exemptions)

### 1. The `EXDEV` Multi-Drive Fallback (CRITICAL)
*   **The Bug**: During local uploads, `multer` saves temporary files in your workspace under the D: drive (e.g. `D:\Projects\DropLink\dist\uploads`). In Electron mode, the controller moves the file to the user's Downloads on the C: drive. Node's `fs.renameSync` maps to the OS `rename` command, which **throws an `EXDEV: cross-device link not permitted` error** when moving files across different physical partitions or drives.
*   **The Fix**: A robust, cross-device copy fallback is implemented inside `fileController.ts`:
    ```typescript
    try {
      fs.renameSync(source, target);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(source, target);
        fs.unlinkSync(source);
      } else {
        throw err;
      }
    }
    ```

### 2. Browser Input Min-Width Flex Clipping
*   **The Bug**: Under Chrome/Blink engines, HTML `<input>` elements possess a default hardcoded size. When placed inside a flex row container next to a button (like the Token Security "Apply" button), the input refuses to shrink below this size, pushing the adjacent button outside the container boundaries where it gets clipped.
*   **The Fix**: Explicitly declare `min-width: 0;` on both the security token input and the connection URL input inside `public/style.css` to allow fluid resizing.

### 3. Viewport & Text Overflow Locks
*   **The Bug**: Long filenames (like `Screenshot_20260522_192039_Instagram.png`) force flex elements to expand horizontally, breaking mobile viewports and introducing annoying panning/zooming issues.
*   **The Fix**:
    - Add `width: 100%; max-width: 100%; overflow-x: hidden;` to both **`html`** and **`body`** in CSS.
    - Set `.file-card { min-width: 0; }` and `.file-details { overflow: hidden; min-width: 0; }` to force browser engines to cleanly truncate long text with an ellipsis `...` inside flex layouts.

---

## 📜 Git Commit Guidelines

When generating or executing Git commits for this repository, always append the following exact co-author attribution line to the very bottom of the commit message footer (separated by an empty line):

```text
Co-authored-by: Antigravity <noreply@google.com>
```
