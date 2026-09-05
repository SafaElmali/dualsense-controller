import { mkdir, rm, copyFile, cp } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('controller', 'dist/controller', { recursive: true });
