const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('akaDesktop', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
});
