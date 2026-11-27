import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// O App foi dividido em componentes: as guardas passam a varrer todo o código de interface.
const srcRoot = fileURLToPath(new URL("../src", import.meta.url));
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}
const files = sourceFiles(srcRoot);
const app = files.map((file) => readFileSync(file, "utf8")).join("\n");
const components = files.filter((file) => file.endsWith(".tsx")).map((file) => readFileSync(file, "utf8")).join("\n");
const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

describe("guardas de regressão no código-fonte", () => {
  it("varre o App e os componentes extraídos", () => {
    expect(files.some((file) => file.endsWith("App.tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(10);
  });

  it("não usa \\\\d escapado duas vezes em regex literal (quebrava meta e fatura)", () => {
    expect(app).not.toMatch(/\/\^\\\\d/);
  });

  it("não renderiza \\n literal no JSX", () => {
    expect(app).not.toMatch(/<\/p>\\n\s/);
  });

  it("não chama métodos de string em valores numeric vindos do banco", () => {
    expect(app).not.toMatch(/item\.amount\.replace\(/);
    expect(app).not.toMatch(/String\([a-z.]+_(?:balance|limit|price)\)\.replace\(/);
  });

  it("mantém uma única folha de estilos sem !important fora de [hidden]", () => {
    const rules = css.split("\n").filter((line) => line.includes("!important") && !line.trim().startsWith("*") && !line.includes("/*"));
    expect(rules).toEqual(["[hidden] { display: none !important; }"]);
  });

  it("não usa cores fixas fora dos tokens nos componentes", () => {
    expect(components).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/);
  });
});
