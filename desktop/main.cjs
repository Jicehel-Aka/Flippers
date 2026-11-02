const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Permet l'audio WebAudio synthétique immédiat sans latence
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: '#0C0E12',
    title: 'Gamebuino AKA Pinball',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);

  // Bascule plein écran arcade via F11 ou Alt+Entrée
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F11' || (input.alt && input.key === 'Enter'))
    ) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const indexPath = path.join(__dirname, 'app', 'index.html');
  win.loadFile(indexPath);
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
