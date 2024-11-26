import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'lib',
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
});