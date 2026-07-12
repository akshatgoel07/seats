import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        bench: `${root}bench.html`,
      },
    },
  },
});
