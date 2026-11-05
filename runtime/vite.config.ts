import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'bnitjs',
    },
    // three is a peer dependency: never bundle it.
    rollupOptions: {
      external: [/^three(\/.*)?$/],
    },
    emptyOutDir: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
