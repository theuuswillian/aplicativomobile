import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "supabase"];
const forbidden = [
  ["Pluggy", /pluggy/i],
  ["Mercado Pago", /mercado\s*pago|mercadopago/i],
  ["billing/paid subscription", /\bbilling\b|\bpaid[\s_-]+subscriptions?\b|\bsubscription_plan\b/i]
];
const forbiddenRootFiles = ["app.js", "app.min.js", "app.min.js.map"];

async function filesUnder(path) {
  let entries;
  try { entries = await readdir(path); } catch { return []; }
  const found = [];
  for (const entry of entries) {
    const full = join(path, entry);
    const info = await stat(full);
    if (info.isDirectory()) found.push(...await filesUnder(full));
    else if (/\.(tsx?|jsx?|sql)$/.test(entry)) found.push(full);
  }
  return found;
}

const violations = [];
for (const rootName of sourceRoots) {
  for (const file of await filesUnder(join(root, rootName))) {
    const content = await readFile(file, "utf8");
    for (const [label, pattern] of forbidden) {
      if (pattern.test(content)) violations.push(`${file}: referência proibida a ${label}`);
    }
  }
}
for (const file of forbiddenRootFiles) {
  try {
    await stat(join(root, file));
    violations.push(`arquivo legado proibido na raiz: ${file}`);
  } catch {
    // A ausência do arquivo legado é o estado esperado.
  }
}

if (violations.length) {
  console.error("Falha na verificação arquitetural:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Verificação arquitetural concluída sem violações conhecidas.");
}
