const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ownerSetup', {
  submit: owner => ipcRenderer.invoke('maltiva:setup-owner', owner),
});
