const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nekzDesktop', Object.freeze({
  getAdminToken: () => ipcRenderer.invoke('get-admin-token'),
  getSetup: () => ipcRenderer.invoke('get-setup'),
  saveSetup: settings => ipcRenderer.invoke('save-setup', settings),
  openSetup: () => ipcRenderer.send('open-setup')
}));
