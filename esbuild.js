const esbuild = require('esbuild');

const production = process.argv.includes('--production');

// 打包 extension.js
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
}).then(() => {
  console.log('✅ extension.js built');
}).catch(() => process.exit(1));

// 打包 mcp-stdio-wrapper.js
esbuild.build({
  entryPoints: ['src/mcp-stdio-wrapper.ts'],
  bundle: true,
  outfile: 'dist/mcp-stdio-wrapper.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  banner: {
    js: '#!/usr/bin/env node'
  }
}).then(() => {
  console.log('✅ mcp-stdio-wrapper.js built');
}).catch(() => process.exit(1));
