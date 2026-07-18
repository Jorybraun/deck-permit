import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api/review-exchange': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/api/municipal-submission': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/api/sidney-property': {
        target: 'https://services5.arcgis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/sidney-property', '/MNn7A6yzK94Hggl3/arcgis/rest/services/Sync_Enabled_Property_Line_NEW/FeatureServer/0/query'),
      },
      '/api/sidney-rooflines': {
        target: 'https://services5.arcgis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/sidney-rooflines', '/MNn7A6yzK94Hggl3/arcgis/rest/services/Sync_Enabled_Rooflines/FeatureServer/0/query'),
      },
      '/api/sidney-application': {
        target: 'https://www.sidney.ca',
        changeOrigin: true,
        rewrite: () => '/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf',
      },
    },
  }
});
