import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src", "supabase", "public", ".github", "scripts"];
const forbidden = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["service-role secret", /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*\S+/i],
  ["secret in VITE variable", /VITE_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|SERVICE_ROLE|PRIVATE_KEY)\s*[:=]\s*\S+/i],
  ["provider secret", /\b(?:sk_live|sk_test|rk_live|whsec)_[A-Za-z0-9]{16,}\b/],
  ["JWT literal", /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/]
];

async function walk(path) {
  let entries;
  try { entries = await readdir(path); } catch { return []; }
  const result = [];
  for (const entry of entries) {
    const full = join(path, entry);
    const info = await stat(full);
    if (info.isDirectory()) result.push(...await walk(full));
    else if (/\.(?:[cm]?[jt]sx?|sql|html|svg|css|ya?ml|json|webmanifest)$/.test(entry)) result.push(full);
  }
  return result;
}

const violations = [];
for (const root of roots) {
  for (const file of await walk(root)) {
    const rawContent = await readFile(file, "utf8");
    // Referenciar um secret do GitHub Actions não versiona seu valor; só esta
    // expressão exata é permitida. Valores literais continuam bloqueados.
    const content = rawContent.replace(
      /SUPABASE_SERVICE_ROLE_KEY\s*:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/g,
      "",
    );
    for (const [label, pattern] of forbidden) {
      if (pattern.test(content)) violations.push(`${file}: possível ${label}`);
    }
  }
}

for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
  try {
    await stat(name);
    violations.push(`arquivo local de ambiente não deve ser versionado: ${name}`);
  } catch {
    // Arquivos locais de ambiente ausentes não são uma violação.
  }
}

if (violations.length) {
  console.error("Falha na verificação de segredos:");
  for (const item of violations) console.error("- " + item);
  process.exitCode = 1;
} else {
  console.log("Verificação de segredos concluída sem ocorrências conhecidas.");
}
