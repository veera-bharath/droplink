/**
 * DROPLINK CLIENT APPLICATION
 * Polished Vanilla JS for local file transferring and WebSocket synchronization.
 */

// Application State
const state = {
  token: '',
  serverIp: '',
  serverPort: 3000,
  connectionUrl: '',
  files: [],
  socket: null,
  activeUploads: new Map(), // Tracks ongoing uploads by file name
  uploadQueue: [], // Tracks items in the upload queue
  uploadsDir: '',
  myUploads: new Set(), // Tracks files uploaded by this specific client tab to prevent self-notification
  isPasswordSet: false
};

const MAX_CONCURRENT_UPLOADS = 2;


// DOM Elements
const DOM = {
  serverStatus: document.querySelector('#server-status'),
  syncStatus: document.querySelector('#sync-status'),
  tokenInput: document.querySelector('#token-input'),
  btnSaveToken: document.querySelector('#btn-save-token'),
  tokenStatusBanner: document.querySelector('#token-status-banner'),
  qrCodeWrapper: document.querySelector('#qr-code-wrapper'),
  connectionUrlInput: document.querySelector('#connection-url'),
  btnCopyUrl: document.querySelector('#btn-copy-url'),
  dropZone: document.querySelector('#drop-zone'),
  filePicker: document.querySelector('#file-picker'),
  activeUploadsSection: document.querySelector('#active-uploads-section'),
  activeUploadsList: document.querySelector('#active-uploads-list'),
  filesGrid: document.querySelector('#files-grid'),
  filesCount: document.querySelector('#files-count'),
  searchInput: document.querySelector('#search-input'),
  toastContainer: document.querySelector('#toast-container'),
  btnChangeDownloads: document.querySelector('#btn-change-downloads'),
  activeFolderPathContainer: document.querySelector('#active-folder-path-container'),
  activeFolderPath: document.querySelector('#active-folder-path'),
  notificationAlertsToggle: document.querySelector('#notification-alerts-toggle'),

  // Password Configuration Elements
  passwordProtectionToggle: document.querySelector('#password-protection-toggle'),
  passwordSetupPanel: document.querySelector('#password-setup-panel'),
  passwordInput: document.querySelector('#password-input'),
  btnSavePassword: document.querySelector('#btn-save-password'),
  tokenDescText: document.querySelector('#token-desc-text'),
  
  // Lightbox Selectors
  lightboxOverlay: document.querySelector('#preview-lightbox'),
  lightboxIcon: document.querySelector('#lightbox-icon'),
  lightboxFilename: document.querySelector('#lightbox-filename'),
  lightboxBody: document.querySelector('#lightbox-body'),
  btnLightboxDownload: document.querySelector('#btn-lightbox-download'),
  btnLightboxDelete: document.querySelector('#btn-lightbox-delete'),
  btnLightboxClose: document.querySelector('#btn-lightbox-close')
};

// -------------------------------------------------------------
// TOAST NOTIFICATIONS SYSTEM
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Custom SVG icon based on type
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-message">${message}</div>
  `;
  
  DOM.toastContainer.appendChild(toast);
  
  // Slide out after 3.5s, remove after 4s
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function triggerNotification(title, body) {
  // If running inside Electron, trigger native OS notification
  if (window.electronAPI && window.electronAPI.showNotification) {
    window.electronAPI.showNotification(title, body);
  } 
  // Otherwise, fallback to HTML5 Web Notification API
  else if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: '/assets/icon.png' });
      } catch (err) {
        console.error('Failed to trigger HTML5 notification:', err);
      }
    }
  }
}

// -------------------------------------------------------------
// UTILITY FUNCTIONS
// -------------------------------------------------------------
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  // Fallback to local string format
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function getFileCategory(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'],
    audio: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
    archive: ['zip', 'rar', 'tar', 'gz', '7z', 'bz2'],
    code: ['html', 'css', 'js', 'ts', 'json', 'py', 'java', 'cpp', 'c', 'sh', 'xml', 'md', 'env', 'gitignore', 'gitconfig', 'license']
  };
  
  for (const [key, extensions] of Object.entries(types)) {
    if (extensions.includes(ext)) return key;
  }
  return 'generic';
}

function getFileIcon(category) {
  switch (category) {
    case 'image':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    case 'video':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    case 'audio':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    case 'document':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case 'archive':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`;
    case 'code':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
  }
}

function updateFolderPathDisplay() {
  if (window.electronAPI && window.electronAPI.isElectron && state.uploadsDir) {
    if (DOM.activeFolderPath) {
      DOM.activeFolderPath.innerText = state.uploadsDir;
    }
    if (DOM.activeFolderPathContainer) {
      DOM.activeFolderPathContainer.style.display = 'flex';
    }
  } else {
    if (DOM.activeFolderPathContainer) {
      DOM.activeFolderPathContainer.style.display = 'none';
    }
  }
}

// -------------------------------------------------------------
// INITIALIZATION & SERVER SYNC
// -------------------------------------------------------------
async function initApp() {
  try {
    // 1. Fetch system details
    const response = await fetch('/config');
    if (!response.ok) throw new Error('Failed to load server configuration.');
    const config = await response.json();

    state.serverIp = config.ip;
    state.serverPort = config.port;
    state.connectionUrl = config.connectionUrl;
    state.uploadsDir = config.uploadsDir || '';
    
    // Render save directory if inside Electron
    updateFolderPathDisplay();

    // Render QR Code Image
    if (config.qrCode) {
      DOM.qrCodeWrapper.classList.remove('loading-skeleton');
      DOM.qrCodeWrapper.innerHTML = `<img src="${config.qrCode}" alt="Wi-Fi QR Code Access">`;
    }
    
    // Render Connection URL Textbox
    DOM.connectionUrlInput.value = config.connectionUrl;

    // 2. Token extraction & login resolution
    let activeToken = '';
    state.isPasswordSet = !!config.isPasswordSet;

    // A: Localhost auto-auth
    if (config.token) {
      activeToken = config.token;
      showTokenStatus('Host system authenticated.', 'success');
    } 
    // B: URL query parameter (?token=...)
    else {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        activeToken = urlToken;
        localStorage.setItem('droplink_token', urlToken);
        showTokenStatus('QR security key accepted.', 'success');
        
        // Clean URL parameter visually without page reload
        window.history.replaceState({}, document.title, window.location.pathname);
      } 
      // C: LocalStorage persistent token
      else {
        const storedToken = localStorage.getItem('droplink_token');
        if (storedToken) {
          activeToken = storedToken;
          showTokenStatus('Restored previous key.', 'success');
        } else {
          if (state.isPasswordSet) {
            showTokenStatus('Enter password to access files.', 'error');
            showToast('Security password required to download or upload.', 'error');
          } else {
            showTokenStatus('Please enter security token.', 'error');
            showToast('Security token required to download or upload.', 'error');
          }
        }
      }
    }

    if (activeToken) {
      state.token = activeToken;
      DOM.tokenInput.value = activeToken;
    }

    // Configure password setup display and details dynamically
    if (DOM.passwordProtectionToggle && DOM.passwordSetupPanel) {
      DOM.passwordProtectionToggle.checked = state.isPasswordSet;
      DOM.passwordSetupPanel.style.display = state.isPasswordSet ? 'flex' : 'none';
      if (state.isPasswordSet) {
        DOM.passwordInput.placeholder = '••••••••';
      } else {
        DOM.passwordInput.placeholder = 'Min 4 characters';
      }
    }

    if (state.isPasswordSet) {
      if (DOM.tokenDescText) {
        DOM.tokenDescText.innerText = 'This server is password-protected. Enter the custom password or the token shown on the host computer to access files.';
      }
      if (DOM.tokenInput) {
        DOM.tokenInput.placeholder = 'ENTER PASSWORD OR TOKEN';
      }
    } else {
      if (DOM.tokenDescText) {
        DOM.tokenDescText.innerText = 'This server is protected. Enter the token shown on the host computer to access files.';
      }
      if (DOM.tokenInput) {
        DOM.tokenInput.placeholder = 'ENTER 6-DIGIT TOKEN';
      }
    }

    // 3. Initialize notification preferences state
    if (DOM.notificationAlertsToggle) {
      const storedPref = localStorage.getItem('droplink_notifications');
      if (storedPref !== null) {
        DOM.notificationAlertsToggle.checked = storedPref === 'true';
      } else {
        DOM.notificationAlertsToggle.checked = true; // Enabled by default
      }
    }

    // 4. Connect to WebSockets & load files
    connectWebSocket();
    loadFiles();

  } catch (error) {
    showToast(error.message, 'error');
    console.error(error);
  }
}

function showTokenStatus(message, type) {
  DOM.tokenStatusBanner.className = `token-status-message ${type}`;
  DOM.tokenStatusBanner.innerText = message;
  
  const tokenCard = document.querySelector('.token-card');
  if (tokenCard) {
    if (type === 'success') {
      tokenCard.classList.add('authenticated');
    } else {
      tokenCard.classList.remove('authenticated');
    }
  }
}

// -------------------------------------------------------------
// WEBSOCKET MANAGEMENT
// -------------------------------------------------------------
function connectWebSocket() {
  if (!state.token) {
    DOM.syncStatus.className = 'status-indicator';
    DOM.syncStatus.querySelector('.status-text').innerText = 'Sync Offline (No Token)';
    DOM.syncStatus.querySelector('.dot').className = 'dot red';
    return;
  }

  // Construct WebSocket address. Use host IP dynamically.
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/?token=${state.token}`;

  if (state.socket) {
    state.socket.close();
  }

  DOM.syncStatus.querySelector('.status-text').innerText = 'Sync connecting...';
  DOM.syncStatus.querySelector('.dot').className = 'dot orange pulse';

  const ws = new WebSocket(wsUrl);
  state.socket = ws;

  ws.onopen = () => {
    DOM.syncStatus.querySelector('.status-text').innerText = 'Live Sync Active';
    DOM.syncStatus.querySelector('.dot').className = 'dot green pulse';
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'file_update') {
        loadFiles(false); // Silent update (no loading spinners)
        
        // Show context toast notifications
        if (data.payload.action === 'upload') {
          const uploadedFiles = data.payload.files;
          const externalFiles = [];
          
          uploadedFiles.forEach(filename => {
            if (state.myUploads.has(filename)) {
              state.myUploads.delete(filename); // Consume the token
            } else {
              externalFiles.push(filename);
            }
          });

          showToast(`New file uploaded: ${uploadedFiles.join(', ')}`, 'success');

          if (externalFiles.length > 0 && DOM.notificationAlertsToggle && DOM.notificationAlertsToggle.checked) {
            const title = 'New File Received';
            const body = externalFiles.length === 1 
              ? `'${externalFiles[0]}' has been transferred from a connected device.`
              : `${externalFiles.length} new files have been transferred from a connected device.`;
            triggerNotification(title, body);
          }
        } else if (data.payload.action === 'delete') {
          showToast(`File removed: ${data.payload.file}`, 'info');
        }
      }
    } catch (err) {
      console.error('WS JSON parse error:', err);
    }
  };

  ws.onclose = () => {
    DOM.syncStatus.querySelector('.status-text').innerText = 'Sync Disconnected';
    DOM.syncStatus.querySelector('.dot').className = 'dot red';
    
    // Auto-retry connection in 5 seconds
    setTimeout(() => {
      if (state.token && (!state.socket || state.socket.readyState === WebSocket.CLOSED)) {
        connectWebSocket();
      }
    }, 5000);
  };

  ws.onerror = () => {
    DOM.syncStatus.querySelector('.status-text').innerText = 'Sync connection error';
    DOM.syncStatus.querySelector('.dot').className = 'dot red';
  };
}

// -------------------------------------------------------------
// LOADING & RENDERING FILES
// -------------------------------------------------------------
async function loadFiles(showSpinner = true) {
  if (showSpinner) {
    DOM.filesGrid.innerHTML = `
      <div class="files-status-message">
        <div class="spinner"></div>
        <p>Syncing directory contents...</p>
      </div>
    `;
  }

  try {
    const response = await fetch('/files', {
      headers: {
        'X-Session-Token': state.token
      }
    });

    if (response.status === 401) {
      DOM.filesGrid.innerHTML = `
        <div class="files-status-message">
          <svg style="width:32px;height:32px;color:var(--danger)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <p>Access Denied. Invalid or missing security token.</p>
        </div>
      `;
      DOM.filesCount.innerText = '0 files shared';
      return;
    }

    if (!response.ok) throw new Error('Could not pull shared file directory.');

    const files = await response.json();
    state.files = files;
    renderFiles();

  } catch (error) {
    DOM.filesGrid.innerHTML = `
      <div class="files-status-message">
        <p style="color:var(--danger)">⚠️ Error loading directory: ${error.message}</p>
      </div>
    `;
  }
}

function renderFiles() {
  const searchQuery = DOM.searchInput.value.toLowerCase().trim();
  const filtered = state.files.filter(file => file.name.toLowerCase().includes(searchQuery));
  
  DOM.filesCount.innerText = `${state.files.length} file${state.files.length === 1 ? '' : 's'} shared`;

  if (filtered.length === 0) {
    DOM.filesGrid.innerHTML = `
      <div class="files-status-message">
        <svg style="width:32px;height:32px;color:var(--text-muted);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
        </svg>
        <p>${searchQuery ? 'No matching files found.' : 'Drop zone is empty. Upload a file above to begin.'}</p>
      </div>
    `;
    return;
  }

  DOM.filesGrid.innerHTML = '';
  filtered.forEach(file => {
    const category = getFileCategory(file.name);
    const icon = getFileIcon(category);
    
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
      <div class="file-info-block">
        <div class="file-icon ${category}">${icon}</div>
        <div class="file-details">
          <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="file-meta-row">
            <span>${formatBytes(file.size)}</span>
            <span>•</span>
            <span>${formatDate(file.date)}</span>
          </div>
          ${renderSelfDestructBadge(file)}
        </div>
      </div>
      <div class="file-actions">
        <button class="action-btn btn-preview" data-filename="${escapeHtml(file.name)}" title="Preview">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <a class="action-btn btn-dl" href="/download/${encodeURIComponent(file.name)}?token=${state.token}" download title="Download">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </a>
        <button class="action-btn btn-del" data-filename="${escapeHtml(file.name)}" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
    
    // Bind Preview handler
    card.querySelector('.btn-preview').addEventListener('click', (e) => {
      const filename = e.currentTarget.getAttribute('data-filename');
      openPreview(filename);
    });
    
    // Bind Delete handler
    card.querySelector('.btn-del').addEventListener('click', (e) => {
      const filename = e.currentTarget.getAttribute('data-filename');
      confirmAndDeleteFile(filename);
    });

    DOM.filesGrid.appendChild(card);
  });

  startCountdownTimer();
}

function escapeHtml(string) {
  return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// UPLOADING FILES & TRACKING SPEEDS
// -------------------------------------------------------------
function uploadFiles(selectedFiles) {
  if (!state.token) {
    showToast('Unauthorized: Please input the session token first.', 'error');
    return;
  }

  const filesArray = Array.from(selectedFiles);
  if (filesArray.length === 0) return;

  // Extract self-destruct settings
  const selfDestructToggle = document.querySelector('#self-destruct-toggle');
  const selfDestructTypeSelect = document.querySelector('#self-destruct-type');
  
  const isSelfDestruct = selfDestructToggle ? selfDestructToggle.checked : false;
  let selfDestructType = 'download';
  let selfDestructValue = 0;
  
  if (isSelfDestruct && selfDestructTypeSelect) {
    const selectVal = selfDestructTypeSelect.value;
    if (selectVal.startsWith('timer_')) {
      selfDestructType = 'timer';
      selfDestructValue = parseInt(selectVal.split('_')[1], 10);
    } else {
      selfDestructType = 'download';
      selfDestructValue = 1;
    }
  }

  // Reset toggle and panel visually for the next upload
  if (selfDestructToggle) {
    selfDestructToggle.checked = false;
    const settingsPanel = document.querySelector('#self-destruct-settings');
    if (settingsPanel) settingsPanel.style.display = 'none';
  }

  // Filter 2GB limit
  const maxLimit = 2 * 1024 * 1024 * 1024;
  const safeFiles = filesArray.filter(file => {
    if (file.size > maxLimit) {
      showToast(`Skipped ${file.name}: Exceeds 2GB limit.`, 'error');
      return false;
    }
    return true;
  });

  if (safeFiles.length === 0) return;

  DOM.activeUploadsSection.style.display = 'block';

  safeFiles.forEach(file => {
    // Prevent double upload of same file concurrently
    if (state.activeUploads.has(file.name)) {
      showToast(`File ${file.name} is already uploading or queued.`, 'info');
      return;
    }

    const uploadId = 'up_' + Math.random().toString(36).substring(2, 9);
    state.activeUploads.set(file.name, uploadId);

    // Create progress card element (starts in queued style)
    const uploadItem = document.createElement('div');
    uploadItem.className = 'upload-item queued';
    uploadItem.id = uploadId;
    uploadItem.innerHTML = `
      <div class="upload-item-header">
        <span class="upload-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <div class="upload-meta-wrapper">
          <span class="upload-item-meta" id="${uploadId}_meta">Queued</span>
          <button class="btn-cancel-upload" data-id="${uploadId}" title="Cancel upload">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="${uploadId}_bar" style="width: 0%;"></div>
      </div>
      <div class="upload-item-footer">
        <span class="upload-speed" id="${uploadId}_speed" style="color: var(--text-muted);">Waiting in queue...</span>
        <span id="${uploadId}_eta">Pending</span>
      </div>
    `;
    
    // Add cancel handler to button
    uploadItem.querySelector('.btn-cancel-upload').addEventListener('click', () => {
      cancelUpload(uploadId);
    });

    DOM.activeUploadsList.appendChild(uploadItem);

    // Push into the queue
    state.uploadQueue.push({
      id: uploadId,
      file: file,
      status: 'queued',
      xhr: null,
      selfDestruct: isSelfDestruct,
      selfDestructType: selfDestructType,
      selfDestructValue: selfDestructValue
    });
  });

  // Kickoff queue processor
  processUploadQueue();
}

function processUploadQueue() {
  // Count actively uploading tasks
  const activeCount = state.uploadQueue.filter(item => item.status === 'uploading').length;

  // Process next items if capacity exists
  let availableSlots = MAX_CONCURRENT_UPLOADS - activeCount;
  
  if (availableSlots <= 0) return;

  for (let i = 0; i < state.uploadQueue.length; i++) {
    const item = state.uploadQueue[i];
    if (item.status === 'queued') {
      item.status = 'uploading';
      startSingleUpload(item);
      availableSlots--;
      if (availableSlots <= 0) break;
    }
  }
}

function startSingleUpload(item) {
  const uploadId = item.id;
  const file = item.file;
  const isSelfDestruct = item.selfDestruct;
  const selfDestructType = item.selfDestructType;
  const selfDestructValue = item.selfDestructValue;

  const uploadItem = document.getElementById(uploadId);
  if (uploadItem) {
    // Transition visually out of queued state
    uploadItem.classList.remove('queued');
    const speedEl = document.getElementById(`${uploadId}_speed`);
    if (speedEl) {
      speedEl.style.color = ''; // Restore brand color
      speedEl.innerText = 'Calculating speed...';
    }
    const etaEl = document.getElementById(`${uploadId}_eta`);
    if (etaEl) {
      etaEl.innerText = '--:-- remaining';
    }
    const metaEl = document.getElementById(`${uploadId}_meta`);
    if (metaEl) {
      metaEl.innerText = '0%';
    }
  }

  // Create AJAX request
  const xhr = new XMLHttpRequest();
  item.xhr = xhr;
  const startTime = Date.now();
  let lastTime = startTime;
  let lastLoaded = 0;

  xhr.open('POST', '/upload');
  xhr.setRequestHeader('X-Session-Token', state.token);

  // Upload Progress handler
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const currentTime = Date.now();
      const percent = Math.round((event.loaded / event.total) * 100);
      
      const barEl = document.getElementById(`${uploadId}_bar`);
      if (barEl) barEl.style.width = `${percent}%`;

      const metaEl = document.getElementById(`${uploadId}_meta`);
      if (metaEl) {
        metaEl.innerText = `${percent}% (${formatBytes(event.loaded)} / ${formatBytes(event.total)})`;
      }

      // Calculate speed (bytes per second) since last progress tick
      const timeDiff = (currentTime - lastTime) / 1000; // in seconds
      if (timeDiff >= 0.2) { // update speed details every 200ms
        const loadedDiff = event.loaded - lastLoaded;
        const speedBytesSec = loadedDiff / timeDiff;
        
        const speedEl = document.getElementById(`${uploadId}_speed`);
        if (speedEl) speedEl.innerText = `${formatBytes(speedBytesSec)}/s`;

        // Calculate ETA
        const remainingBytes = event.total - event.loaded;
        const etaSecs = remainingBytes / speedBytesSec;
        
        const etaEl = document.getElementById(`${uploadId}_eta`);
        if (etaEl) {
          if (etaSecs === Infinity || isNaN(etaSecs)) {
            etaEl.innerText = 'Estimating...';
          } else if (etaSecs < 1) {
            etaEl.innerText = 'Finishing...';
          } else {
            const mins = Math.floor(etaSecs / 60);
            const secs = Math.floor(etaSecs % 60);
            etaEl.innerText = mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`;
          }
        }

        lastTime = currentTime;
        lastLoaded = event.loaded;
      }
    }
  };

  // Load complete handler
  xhr.onload = () => {
    // Check if the item was already canceled/removed
    if (!state.uploadQueue.includes(item)) return;

    // Clean up item from active lists and maps
    state.activeUploads.delete(file.name);
    state.uploadQueue = state.uploadQueue.filter(qItem => qItem.id !== uploadId);
    
    const cardEl = document.getElementById(uploadId);
    if (cardEl) cardEl.remove();

    checkActiveUploadsSection();

    if (xhr.status === 200) {
      state.myUploads.add(file.name);
      showToast(`'${file.name}' transferred successfully!`, 'success');
      loadFiles(false); // Silently reload
    } else {
      let errorMsg = 'Server error';
      try {
        const responseData = JSON.parse(xhr.responseText || '{}');
        errorMsg = responseData.error || errorMsg;
      } catch (e) {}
      showToast(`Failed to upload ${file.name}: ${errorMsg}`, 'error');
    }

    // Process next in queue
    processUploadQueue();
  };

  // Error handler
  xhr.onerror = () => {
    if (!state.uploadQueue.includes(item)) return;

    state.activeUploads.delete(file.name);
    state.uploadQueue = state.uploadQueue.filter(qItem => qItem.id !== uploadId);

    const cardEl = document.getElementById(uploadId);
    if (cardEl) cardEl.remove();

    checkActiveUploadsSection();
    showToast(`Network error uploading file '${file.name}'`, 'error');

    // Process next in queue
    processUploadQueue();
  };

  // Assemble payload
  const formData = new FormData();
  formData.append('files', file);
  formData.append('selfDestruct', isSelfDestruct ? 'true' : 'false');
  formData.append('selfDestructType', selfDestructType);
  formData.append('selfDestructValue', selfDestructValue.toString());
  xhr.send(formData);
}

function cancelUpload(uploadId) {
  const itemIndex = state.uploadQueue.findIndex(item => item.id === uploadId);
  if (itemIndex === -1) return;

  const item = state.uploadQueue[itemIndex];
  
  // Abort XHR if actively transferring
  if (item.status === 'uploading' && item.xhr) {
    item.xhr.abort();
  }

  // Remove from arrays and DOM
  state.activeUploads.delete(item.file.name);
  state.uploadQueue.splice(itemIndex, 1);

  const cardEl = document.getElementById(uploadId);
  if (cardEl) cardEl.remove();

  showToast(`Upload of '${item.file.name}' was cancelled.`, 'info');
  checkActiveUploadsSection();

  // Process next queue items since slot might have freed up
  processUploadQueue();
}

function renderSelfDestructBadge(file) {
  if (!file.selfDestruct) return '';
  
  if (file.selfDestructType === 'download') {
    const left = file.downloadsLeft ?? 1;
    return `
      <div class="self-destruct-badge badge-download" title="Self-destructs after download">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        </svg>
        <span>${left} download${left === 1 ? '' : 's'} left</span>
      </div>
    `;
  } else if (file.selfDestructType === 'timer' && file.expiresAt) {
    return `
      <div class="self-destruct-badge badge-timer" data-expires="${file.expiresAt}" title="Self-destructs on expiration">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="countdown-text">Expiring...</span>
      </div>
    `;
  }
  return '';
}

let countdownInterval = null;

function startCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  countdownInterval = setInterval(() => {
    const badges = document.querySelectorAll('.badge-timer');
    if (badges.length === 0) {
      return;
    }
    
    const now = new Date().getTime();
    let needReload = false;
    
    badges.forEach(badge => {
      const expiresTime = new Date(badge.getAttribute('data-expires')).getTime();
      const diff = expiresTime - now;
      
      if (diff <= 0) {
        const textEl = badge.querySelector('.countdown-text');
        if (textEl) textEl.innerText = 'Expired';
        needReload = true;
      } else {
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        const textEl = badge.querySelector('.countdown-text');
        if (textEl) {
          textEl.innerText = `Expires in ${timeStr}`;
        }
      }
    });
    
    if (needReload) {
      loadFiles(false);
    }
  }, 1000);
}

function checkActiveUploadsSection() {
  if (state.activeUploads.size === 0) {
    DOM.activeUploadsSection.style.display = 'none';
  }
}

// -------------------------------------------------------------
// DELETING FILES
// -------------------------------------------------------------
async function confirmAndDeleteFile(filename) {
  const confirmed = confirm(`Are you sure you want to delete '${filename}' permanently?`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/file/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'X-Session-Token': state.token
      }
    });

    const data = await response.json();

    if (response.ok) {
      showToast(data.message, 'success');
      loadFiles(false); // Silently refresh files list
    } else {
      showToast(data.error || 'Could not delete file.', 'error');
    }
  } catch (err) {
    showToast('Network error while deleting file.', 'error');
    console.error(err);
  }
}

// -------------------------------------------------------------
// EVENT BINDINGS
// -------------------------------------------------------------
function registerEvents() {

  // Notification toggle — registered once here to prevent stacking when initApp() reruns
  if (DOM.notificationAlertsToggle) {
    DOM.notificationAlertsToggle.addEventListener('change', () => {
      const isChecked = DOM.notificationAlertsToggle.checked;
      localStorage.setItem('droplink_notifications', isChecked ? 'true' : 'false');

      if (isChecked && !window.electronAPI) {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission !== 'granted') {
              showToast('Notification permission denied.', 'info');
              DOM.notificationAlertsToggle.checked = false;
              localStorage.setItem('droplink_notifications', 'false');
            } else {
              showToast('Notification alerts enabled.', 'success');
            }
          });
        }
      }
    });
  }

  // Self-destruct options toggle listener
  const selfDestructToggle = document.querySelector('#self-destruct-toggle');
  const selfDestructSettings = document.querySelector('#self-destruct-settings');
  if (selfDestructToggle && selfDestructSettings) {
    selfDestructToggle.addEventListener('change', () => {
      selfDestructSettings.style.display = selfDestructToggle.checked ? 'block' : 'none';
    });
  }

  // Save/Apply Token Manual Entry (support case-sensitive custom passwords or uppercase session tokens)
  DOM.btnSaveToken.addEventListener('click', () => {
    const rawVal = DOM.tokenInput.value.trim();
    if (!rawVal) {
      showToast('Credentials cannot be blank.', 'error');
      return;
    }
    state.token = rawVal;
    localStorage.setItem('droplink_token', rawVal);
    
    showTokenStatus('Credentials applied.', 'success');
    showToast('Credentials saved and applied!', 'success');
    
    // Re-verify files and sockets
    connectWebSocket();
    loadFiles(true);
  });

  // Handle hitting enter inside token text-box
  DOM.tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      DOM.btnSaveToken.click();
    }
  });

  // Password Protection Toggle handler
  if (DOM.passwordProtectionToggle && DOM.passwordSetupPanel) {
    DOM.passwordProtectionToggle.addEventListener('change', () => {
      const isChecked = DOM.passwordProtectionToggle.checked;
      DOM.passwordSetupPanel.style.display = isChecked ? 'flex' : 'none';
      if (!isChecked) {
        // Disable custom password
        savePassword(null);
      } else {
        DOM.passwordInput.value = '';
        DOM.passwordInput.focus();
      }
    });
  }

  // Custom Password Save Button
  if (DOM.btnSavePassword && DOM.passwordInput) {
    DOM.btnSavePassword.addEventListener('click', () => {
      const password = DOM.passwordInput.value.trim();
      if (password.length < 4) {
        showToast('Password must be at least 4 characters long.', 'error');
        return;
      }
      savePassword(password);
    });

    DOM.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        DOM.btnSavePassword.click();
      }
    });
  }

  // Copy Link to Clipboard
  DOM.btnCopyUrl.addEventListener('click', () => {
    if (!state.connectionUrl) return;
    
    navigator.clipboard.writeText(state.connectionUrl)
      .then(() => {
        showToast('Link copied to clipboard!', 'success');
      })
      .catch(err => {
        showToast('Failed to copy. Please highlight and copy manually.', 'error');
      });
  });

  // File Search bar filtering
  DOM.searchInput.addEventListener('input', () => {
    renderFiles();
  });

  // Drag-and-drop zone interactions
  DOM.dropZone.addEventListener('click', () => {
    DOM.filePicker.click();
  });

  DOM.filePicker.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    DOM.filePicker.value = ''; // Reset files list to allow uploading same file again
  });

  DOM.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.add('dragover');
  });

  DOM.dropZone.addEventListener('dragleave', () => {
    DOM.dropZone.classList.remove('dragover');
  });

  DOM.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  // Close Lightbox from Close button
  DOM.btnLightboxClose.addEventListener('click', () => {
    closePreview();
  });

  // Close Lightbox from backdrop click
  DOM.lightboxOverlay.querySelector('.lightbox-backdrop').addEventListener('click', () => {
    closePreview();
  });

  // Close Lightbox on ESC key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.lightboxOverlay.classList.contains('active')) {
      closePreview();
    }
  });
}

// -------------------------------------------------------------
// MEDIA PREVIEW LIGHTBOX CONTROLLER
// -------------------------------------------------------------
async function openPreview(filename) {
  if (!state.token) {
    showToast('Unauthorized: Please input the session token first.', 'error');
    return;
  }

  const category = getFileCategory(filename);
  const icon = getFileIcon(category);
  const previewUrl = `/preview/${encodeURIComponent(filename)}?token=${state.token}`;
  const downloadUrl = `/download/${encodeURIComponent(filename)}?token=${state.token}`;

  // Update Lightbox Header Details
  DOM.lightboxIcon.innerHTML = icon;
  DOM.lightboxFilename.innerText = filename;
  DOM.lightboxFilename.title = filename;

  // Set action button attributes dynamically
  DOM.btnLightboxDownload.onclick = () => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  DOM.btnLightboxDelete.onclick = () => {
    closePreview();
    confirmAndDeleteFile(filename);
  };

  // Render correct media element inside Lightbox Body based on category
  DOM.lightboxBody.innerHTML = '';
  
  if (category === 'image') {
    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = filename;
    img.className = 'lightbox-image';
    DOM.lightboxBody.appendChild(img);
  } 
  else if (category === 'video') {
    const video = document.createElement('video');
    video.src = previewUrl;
    video.controls = true;
    video.autoplay = true;
    video.className = 'lightbox-video';
    DOM.lightboxBody.appendChild(video);
  } 
  else if (category === 'audio') {
    const audioContainer = document.createElement('div');
    audioContainer.className = 'lightbox-audio-container';
    
    audioContainer.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
      </svg>
      <audio src="${previewUrl}" controls class="lightbox-audio" autoplay></audio>
    `;
    DOM.lightboxBody.appendChild(audioContainer);
  } 
  else if (category === 'code' || filename.endsWith('.txt') || filename.endsWith('.log')) {
    DOM.lightboxBody.innerHTML = `
      <div class="files-status-message">
        <div class="spinner"></div>
        <p>Loading text contents...</p>
      </div>
    `;
    
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) throw new Error('Failed to load file content.');
      const text = await response.text();
      
      DOM.lightboxBody.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'lightbox-text-container';
      pre.innerText = text;
      DOM.lightboxBody.appendChild(pre);
    } catch (err) {
      DOM.lightboxBody.innerHTML = `
        <div class="files-status-message">
          <p style="color:var(--danger)">⚠️ Error loading preview: ${err.message}</p>
        </div>
      `;
    }
  } 
  else if (filename.endsWith('.pdf')) {
    const iframe = document.createElement('iframe');
    iframe.src = previewUrl;
    iframe.className = 'lightbox-pdf';
    DOM.lightboxBody.appendChild(iframe);
  } 
  else {
    const fallback = document.createElement('div');
    fallback.className = 'lightbox-fallback';
    fallback.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
      </svg>
      <p style="font-weight: 600; font-size: 1.1rem; color: #fff; margin: 0;">Preview not supported for this file type</p>
      <p style="font-size: 0.85rem; margin: 0 0 10px 0;">You can download it to view locally on your device.</p>
    `;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn btn-primary';
    downloadBtn.style.padding = '8px 16px';
    downloadBtn.innerHTML = `<span>Download File</span>`;
    downloadBtn.onclick = () => {
      DOM.btnLightboxDownload.click();
    };
    fallback.appendChild(downloadBtn);
    
    DOM.lightboxBody.appendChild(fallback);
  }

  DOM.lightboxOverlay.style.display = 'flex';
  setTimeout(() => {
    DOM.lightboxOverlay.classList.add('active');
  }, 10);
}

function closePreview() {
  if (!DOM.lightboxOverlay) return;
  
  DOM.lightboxOverlay.classList.remove('active');
  
  const video = DOM.lightboxBody.querySelector('video');
  if (video) video.pause();
  const audio = DOM.lightboxBody.querySelector('audio');
  if (audio) audio.pause();
  
  const iframe = DOM.lightboxBody.querySelector('iframe');
  if (iframe) iframe.src = 'about:blank';

  setTimeout(() => {
    DOM.lightboxOverlay.style.display = 'none';
    DOM.lightboxBody.innerHTML = '';
  }, 300);
}

// -------------------------------------------------------------
// PASSWORD PROTECTION PERSISTENCE CLIENT HELPER
// -------------------------------------------------------------
async function savePassword(password) {
  try {
    const response = await fetch('/password-config/set', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': state.token
      },
      body: JSON.stringify({ password })
    });

    if (response.status === 401) {
      showToast('Unauthorized: You do not have permissions to modify server settings.', 'error');
      // Revert UI toggle state
      if (DOM.passwordProtectionToggle) {
        DOM.passwordProtectionToggle.checked = state.isPasswordSet;
        DOM.passwordSetupPanel.style.display = state.isPasswordSet ? 'flex' : 'none';
      }
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update custom password.');
    }

    state.isPasswordSet = (password !== null);
    showToast(data.message, 'success');

    if (password) {
      DOM.passwordInput.placeholder = '••••••••';
      DOM.passwordInput.value = '';
      
      // Update our client session token to use the custom password
      state.token = password;
      localStorage.setItem('droplink_token', password);
      
      // Refresh the application configuration to dynamically update Connection URLs and QR Codes
      initApp();
    } else {
      DOM.passwordInput.placeholder = 'Min 4 characters';
      DOM.passwordInput.value = '';

      // Re-run application initialization to fetch new dynamic token
      initApp();
    }
  } catch (error) {
    showToast(error.message, 'error');
    if (DOM.passwordProtectionToggle) {
      DOM.passwordProtectionToggle.checked = state.isPasswordSet;
      DOM.passwordSetupPanel.style.display = state.isPasswordSet ? 'flex' : 'none';
    }
  }
}

// -------------------------------------------------------------
// APP START
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  registerEvents();
  initApp();

  // Securely bridge native Desktop folder opening if inside Electron
  if (window.electronAPI && window.electronAPI.isElectron) {
    const btnOpenDownloads = document.querySelector('#btn-open-downloads');
    if (btnOpenDownloads) {
      btnOpenDownloads.style.display = 'inline-flex';
      btnOpenDownloads.addEventListener('click', () => {
        window.electronAPI.openDownloads();
      });
    }

    const btnChangeDownloads = document.querySelector('#btn-change-downloads');
    if (btnChangeDownloads) {
      btnChangeDownloads.style.display = 'inline-flex';
      btnChangeDownloads.addEventListener('click', async () => {
        try {
          const selectedPath = await window.electronAPI.selectDirectory();
          if (selectedPath) {
            state.uploadsDir = selectedPath;
            updateFolderPathDisplay();
            showToast('Save directory updated successfully!', 'success');
            // Refresh directory contents to load files from the new path
            loadFiles(true);
          }
        } catch (err) {
          showToast('Failed to change save directory: ' + err.message, 'error');
        }
      });
    }
  }
});
