// Rasterize the existing MaltivaLogo emblem using Chromium; no new artwork.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true } });
  await window.loadURL('data:text/html,<html></html>');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path d="M18 3C9.716 3 3 9.716 3 18h15V3z" fill="#00A389"/><path d="M3 20c.5 7.9 6.9 14.3 14.8 14.8V20H3z" fill="#00B69B"/><path d="M20 34.8C27.9 34.3 34.3 27.9 34.8 20H20v14.8z" fill="#00A389"/><path d="M20 18h14.8C34.3 10.1 27.9 3.7 20 3.2V18z" fill="#008F77"/></svg>';
  const image = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const entries = [];
  for (const size of [16, 32, 48, 256]) {
    const data = await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=${size};canvas.getContext('2d').drawImage(image,0,0,${size},${size});resolve(canvas.toDataURL('image/png').split(',')[1]);};image.onerror=reject;image.src=${JSON.stringify(image)};})`);
    entries.push({ size, bytes: Buffer.from(data, 'base64') });
  }
  const header = Buffer.alloc(6 + 16 * entries.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  for (const [index, entry] of entries.entries()) {
    const position = 6 + index * 16;
    header[position] = header[position + 1] = entry.size === 256 ? 0 : entry.size;
    header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(entry.bytes.length, position + 8); header.writeUInt32LE(offset, position + 12); offset += entry.bytes.length;
  }
  fs.writeFileSync(path.join(__dirname, '../electron/icon.ico'), Buffer.concat([header, ...entries.map(e => e.bytes)]));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
