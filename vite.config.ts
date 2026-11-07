import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev only: POST the browser's raw relay trace here to save it as a test fixture.
const traceSink = (): Plugin => ({
  name: 'trace-sink',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__trace', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const dir = path.resolve('test/fixtures');
        fs.mkdirSync(dir, { recursive: true });
        const name = `trace-${Date.now()}.json`;
        fs.writeFileSync(path.join(dir, name), body);
        res.end(name);
      });
    });
  },
});

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), traceSink()],
  server: {
    port: 5320,
    proxy: { '/ws': { target: 'ws://localhost:4321', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
