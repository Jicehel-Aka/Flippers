import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDist = path.resolve(__dirname, '..', '..', 'dist');
const desktopAppDir = path.resolve(__dirname, '..', 'app');

if (!fs.existsSync(rootDist)) {
  console.error(`[sync-web] Erreur : dossier dist introuvable (${rootDist}). Lancez 'npm run build' d'abord.`);
  process.exit(1);
}

fs.rmSync(desktopAppDir, { recursive: true, force: true });
fs.cpSync(rootDist, desktopAppDir, { recursive: true });
console.log(`[sync-web] Bundle web copié avec succès vers ${desktopAppDir}`);
