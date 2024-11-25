import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: [
    'chalk',
    'ora',
    'cli-table3',
    'commander',
    'dotenv',
    'inquirer',
    'natural',
    'pretty-bytes',
    'winston',
  ],
  esbuildOptions(options) {
    options.banner = {
      js: `
        import { createRequire } from 'module';
        const require = createRequire(import.meta.url);
      `,
    };
  },
});
