import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")) as {
  name: string; display: string; icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const entrypoint = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

describe("PWA shell", () => {
  it("declares a standalone app with a local scalable icon", () => {
    expect(manifest.name).toBe("GranaViva");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toContainEqual(expect.objectContaining({
      src: "/icon.svg", sizes: "any", type: "image/svg+xml"
    }));
  });

  it("registers the service worker only in production", () => {
    expect(entrypoint).toContain('import.meta.env.PROD');
    expect(entrypoint).toContain('navigator.serviceWorker.register("/sw.js")');
  });

  it("does not cache authentication or financial API responses", () => {
    expect(serviceWorker).toContain("if (url.origin !== self.location.origin) return;");
    expect(serviceWorker).toMatch(/\(auth\|rest\|storage\|functions\|realtime\)/);
    expect(serviceWorker).toContain('request.mode === "navigate"');
  });
});
