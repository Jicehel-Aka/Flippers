// Les plateaux de la console AKA sont GENERES depuis src/data/tables.ts : le fichier commite doit etre a jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('firmware AKA : tables_data.inc est à jour avec tables.ts', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/gen-aka-tables.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
