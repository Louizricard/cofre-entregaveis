import { mkdir, copyFile } from 'node:fs/promises';
const assets = ['index.html', 'styles.css', 'site.js', 'favicon.svg', 'privacidade.html'];
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
for (const file of assets) await copyFile(new URL(file, import.meta.url), new URL('dist/' + file, import.meta.url));
console.log('Página estática preparada: cinco arquivos públicos, sem dependências ou dados do produto.');
