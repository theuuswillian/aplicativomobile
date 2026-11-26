/** Normalizes a fractional asset quantity to eight decimal places without floating-point drift. */
export function normalizeInvestmentQuantity(value: string): { atoms: bigint; normalized: string } | null {
  const input = value.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,8})?$/.test(input)) return null;
  const [whole = "0", fraction = ""] = input.split(".");
  const atoms = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  if (atoms <= 0n || atoms > 1_000_000_000n * 100_000_000n) return null;
  return { atoms, normalized: `${whole}.${fraction.padEnd(8, "0")}` };
}
