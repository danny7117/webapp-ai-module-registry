// scripts/update_catalog.cjs
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const OUT = path.join(REPO_ROOT, "module_catalog.json");

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collect(dir = MODULES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name === "manifest.json") out.push(p);
    }
  }
  return out;
}

function main() {
  const files = collect();
  const rows = files.map((f) => {
    const m = readJSON(f);
    // 取常用欄位；缺的欄位給預設空值即可
    return {
      id: m.id ?? "",
      name: m.name ?? "",
      version: m.version ?? "",
      capabilities: m.capabilities ?? [],
      inputs: m.inputs ?? [],
      outputs: m.outputs ?? [],
      resources: m.resources ?? {},
      policy: m.policy ?? {},
      tests: m.tests ?? [],
      path: path.relative(REPO_ROOT, f)
    };
  });

  const json = JSON.stringify({ updatedAt: new Date().toISOString(), count: rows.length, modules: rows }, null, 2);
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== json) {
    fs.writeFileSync(OUT, json);
    console.log("✍️  module_catalog.json updated");
  } else {
    console.log("ℹ️  no catalog changes.");
  }
}

main();
