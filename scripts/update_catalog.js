// scripts/update_catalog.js
import fs from 'fs';
import glob from 'glob';

const catalog = glob.sync('modules/**/manifest.json').map((file) => {
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
