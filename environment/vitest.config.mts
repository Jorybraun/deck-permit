import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  cacheDir: 'reports/vite-cache',
  test: {
    maxWorkers: 2,
  },
});
