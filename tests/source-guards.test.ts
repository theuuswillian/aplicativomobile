import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

describe("guardas de regressão no código-fonte", () => {
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
});
