import { describe, expect, it } from "vitest";
import { normalizeSeries, progressPercent, progressState, projectCompletionMonth } from "../src/lib/progress";

describe("progresso de metas e orçamentos", () => {
  it("calcula percentual sem quebrar com alvo zero", () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(10, 0)).toBe(0);
    expect(progressPercent(300, 200)).toBe(150);
  });
  it("meta comemora em 100%", () => {
    expect(progressState("goal", 99.9)).toBe("progress");
    expect(progressState("goal", 100)).toBe("reached");
  });
  it("orçamento alerta acima de 80% e estoura acima de 100%", () => {
    expect(progressState("budget", 80)).toBe("progress");
    expect(progressState("budget", 81)).toBe("warning");
    expect(progressState("budget", 100)).toBe("warning");
    expect(progressState("budget", 101)).toBe("over");
  });
  it("prevê o mês de conclusão com contribuição mensal", () => {
    expect(projectCompletionMonth(0, 1000_00, 250_00, "2026-11-27")).toBe("2027-03");
    expect(projectCompletionMonth(900_00, 1000_00, 250_00, "2026-12-01")).toBe("2027-01");
    expect(projectCompletionMonth(1000_00, 1000_00, 250_00, "2026-11-27")).toBeNull();
    expect(projectCompletionMonth(0, 1000_00, 0, "2026-11-27")).toBeNull();
  });
  it("normaliza séries de sparkline", () => {
    expect(normalizeSeries([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(normalizeSeries([3, 3])).toEqual([0.5, 0.5]);
  });
});
