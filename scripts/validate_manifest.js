// scripts/validate_manifest.js
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const allowedTags = yaml.load(fs.readFileSync('tags.yml', 'utf8'));

const schema = {
  type: 'object',
  required: ['name', 'insert', 'env', 'tags'],
  properties: {
    name: { type: 'string' },
    needs: { type: 'array', items: { type: 'string' } },
    insert: {
      type: 'array',
      items: {
        type: 'object',
        required: ['target', 'patch'],
        properties: {
          target: { type: 'string' },
          patch: { type: 'string' }
        }
      }
    },
    env: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } }
  }
};

const validate = ajv.compile(schema);
let errorCount = 0;

glob.sync('modules/**/manifest.json').forEach((file) => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!validate(data)) {
    console.error(`❌ Schema error in ${file}`, validate.errors);
    errorCount++;
  }
  const badTag = data.tags.find((t) => !allowedTags.includes(t));
  if (badTag) {
    console.error(`❌ Unknown tag "${badTag}" in ${file}`);
    errorCount++;
  }
  data.insert.forEach(({ patch }) => {
    if (!fs.existsSync(path.join(path.dirname(file), patch))) {
      console.error(`❌ Patch file missing: ${patch} (in ${file})`);
      errorCount++;
    }
  });
});

if (errorCount > 0) {
  console.error(`✘ Manifest validation failed with ${errorCount} error(s).`);
  process.exit(1);
}
console.log('✓ All manifest files valid.');
