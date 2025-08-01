// scripts/update_catalog.js
import fs from 'fs';
import { globSync } from 'glob';

const catalog = globSync('modules/**/manifest.json').map((file) => {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    name: m.name,
    path: file.replace('/manifest.json', ''),
    tags: m.tags,
    env: m.env
  };
});
fs.writeFileSync('module_catalog.json', JSON.stringify(catalog, null, 2));
console.log(`catalog updated (${catalog.length} modules).`);
