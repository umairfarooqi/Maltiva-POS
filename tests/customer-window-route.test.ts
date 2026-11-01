// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
it('opens the dedicated customer display on the second monitor without loading terminal controls', async () => {
  const urls: string[] = [];
  class Window { loadURL(url: string) { urls.push(url); } on() {} static getAllWindows() { return []; } }
  const electron = { app: { getPath: () => '/fixture-only', whenReady: () => Promise.resolve(), on() {} }, BrowserWindow: Window,
    screen: { getAllDisplays: () => [{ bounds: { x: 0, y: 0 } }, { bounds: { x: 1280, y: 0 } }] } };
  const context = { require: (id: string) => id === 'electron' ? electron : id === 'path' ? path : {}, __dirname: path.resolve('electron'),
    process: { env: { PORT: '54321' }, platform: 'win32' }, console, fetch: async () => ({ ok: true }), setTimeout };
  vm.runInNewContext(readFileSync('electron/main.cjs', 'utf8'), context);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(urls).toEqual(['http://127.0.0.1:54321', 'http://127.0.0.1:54321/customer-display']);
});
