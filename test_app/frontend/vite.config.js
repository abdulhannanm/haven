import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/
  },
  server: {
    port: 3000,
    proxy: {
      '/projects': 'http://localhost:8000',
      '/donations': 'http://localhost:8000',
      '/volunteers': 'http://localhost:8000',
      '/stats': 'http://localhost:8000'
    }
  }
});
