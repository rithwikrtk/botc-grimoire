import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@test': fileURLToPath(new URL('./test', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
});
