const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dailyNote', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  chooseDataDir: () => ipcRenderer.invoke('data-dir:choose'),
  openDataDir: () => ipcRenderer.invoke('data-dir:open'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  closeQuickCapture: () => ipcRenderer.invoke('window:close-quick-capture'),
  noteSaved: () => ipcRenderer.invoke('note:saved'),
  onNoteSaved: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('note:saved', listener);
    return () => ipcRenderer.removeListener('note:saved', listener);
  },
});
