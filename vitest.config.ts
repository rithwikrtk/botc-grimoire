import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    // No root-level options here: with `projects` set, Vitest resolves test
    // options per project and root ones do not propagate.
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'app',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          // Extends the defaults rather than replacing them, so node_modules and
          // dist stay excluded.
          exclude: [...configDefaults.exclude, 'src/engine/reducer/**'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'reducer-purity',
          globals: true,
          environment: 'node',
          include: ['src/engine/reducer/**/*.test.ts'],
          setupFiles: ['./src/engine/reducer/purity.setup.ts'],
        },
      },
    ],
  },
});
