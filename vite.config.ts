import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
    // Legacy AI Studio media is personal material, not part of the public release.
    publicDir: mode === 'static' ? 'cloudflare/pages' : 'public',
    build: { outDir: mode === 'static' ? 'dist-static' : 'dist' },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
            // Autosaved state is runtime data, not source code to hot-reload.
            ignored: ['**/.data/**'],
          },
    },
    preview: {
      allowedHosts: true,
    },
  };
});
