import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build also works from a sub-folder (GitHub Pages).
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
  },
} as never);
