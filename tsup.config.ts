import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'lib',
  splitting: false,
  sourcemap: true,
  target: 'node20',
  shims: true,
  treeshake: true,
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
  esbuildOptions(options) {
    options.banner = {
      js: `
        import { createRequire } from 'module';
        const require = createRequire(import.meta.url);
      `,
    };
  },
});