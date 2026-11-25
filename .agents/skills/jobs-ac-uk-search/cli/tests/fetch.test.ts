import { afterEach, beforeAll, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

const realFetch = globalThis.fetch;
let calls: { url: string; headers: Record<string, string> }[] = [];

beforeAll(() => {
  process.env.JOBS_AC_UK_DELAY_MS = "0";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

/** Replace fetch with one that plays `script` in order: a status number, or "throw" for a network error. */
function fakeFetch(script: (number | "throw")[]) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step === "throw") throw new TypeError("fetch failed");
    return new Response(step === 200 ? "ok" : "err", { status: step });
  }) as typeof fetch;
}

test("retries once after a network error, then succeeds", async () => {
  fakeFetch(["throw", 200]);
  expect(await htmlFetch("https://www.jobs.ac.uk/x")).toBe("ok");
  expect(calls).toHaveLength(2);
});

test("retries once after 503, then succeeds", async () => {
  fakeFetch([503, 200]);
  expect(await htmlFetch("https://www.jobs.ac.uk/x")).toBe("ok");
  expect(calls).toHaveLength(2);
});

test("gives up after the second failure", async () => {
  fakeFetch([503, 503, 200]);
  await expect(htmlFetch("https://www.jobs.ac.uk/x")).rejects.toThrow(/503/);
  expect(calls).toHaveLength(2);
});

test("returns null on 404 without retrying", async () => {
  fakeFetch([404]);
  expect(await htmlFetch("https://www.jobs.ac.uk/x")).toBeNull();
  expect(calls).toHaveLength(1);
});

test("sends the honest User-Agent", async () => {
  fakeFetch([200]);
  await htmlFetch("https://www.jobs.ac.uk/x");
  expect(calls[0].headers["User-Agent"]).toBe("Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)");
});
