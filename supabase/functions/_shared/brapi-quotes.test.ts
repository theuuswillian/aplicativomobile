import { strictEqual } from "node:assert/strict";
import { parseBrapiQuote } from "./brapi-quotes.ts";

const observedAt = new Date(Date.now() - 60_000).toISOString();
const sample = {
  requestedAt: new Date().toISOString(),
  results: [{
    symbol: "PETR4",
    data: {
      symbol: "PETR4",
      currency: "BRL",
      regularMarketPrice: 38.5,
      regularMarketPreviousClose: 37.9,
      regularMarketTime: observedAt,
    },
  }],
};

Deno.test("normalizes a valid Brapi quote and preserves source observation time", () => {
  const quote = parseBrapiQuote(sample, "PETR4");
  strictEqual(quote?.symbol, "PETR4");
  strictEqual(quote?.price, 38.5);
  strictEqual(quote?.previous_close, 37.9);
  strictEqual(quote?.currency, "BRL");
  strictEqual(quote?.observed_at, observedAt);
});

Deno.test("rejects malformed, mismatched, non-BRL and future quotes", () => {
  strictEqual(parseBrapiQuote({ results: [] }, "PETR4"), null);
  strictEqual(parseBrapiQuote(sample, "VALE3"), null);
  strictEqual(parseBrapiQuote({ results: [{ ...sample.results[0], data: {
    ...sample.results[0].data, currency: "USD",
  } }] }, "PETR4"), null);
  strictEqual(parseBrapiQuote({ results: [{ ...sample.results[0], data: {
    ...sample.results[0].data, regularMarketPrice: 0,
  } }] }, "PETR4"), null);
  strictEqual(parseBrapiQuote({ results: [{ ...sample.results[0], data: {
    ...sample.results[0].data, regularMarketTime: "invalid",
  } }] }, "PETR4"), null);
});
