import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// One version for the installer and the interface: package.json.
const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      // Keep even small font subsets compatible with the POS font-src policy.
      assetsInlineLimit: file => /\.woff2?$/i.test(file) ? false : undefined,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
  };
});
