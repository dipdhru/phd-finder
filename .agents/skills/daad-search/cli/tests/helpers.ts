import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

/** Day the fixtures in tests/fixtures/ were saved from the live site. */
export const FIXTURE_DATE = new Date("2026-11-26T12:00:00Z");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCLI(args: string[], preload?: string): Promise<CLIResult> {
  const proc = Bun.spawn(["bun", "run", ...(preload ? ["--preload", preload] : []), CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    // No pacing or retry backoff in tests.
    env: { ...process.env, DAAD_DELAY_MS: "0" },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Run the real CLI with every request to www2.daad.de answered by
 * `respond` on a local server - offline, and recording what was asked for.
 */
export async function runWithServer(
  args: string[],
  respond: (url: URL, headers: Headers) => Response | Promise<Response>,
): Promise<{ result: CLIResult; requests: { url: URL; headers: Headers }[] }> {
  const requests: { url: URL; headers: Headers }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push({ url, headers: request.headers });
      return respond(url, request.headers);
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "daad-fixture-"));
  const preload = join(dir, "fetch.ts");
  writeFileSync(preload, `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== "https://www2.daad.de") throw new Error("Unexpected request to " + url.origin);
      return originalFetch(${JSON.stringify(server.url.origin)} + url.pathname + url.search, init);
    };
  `);
  try {
    return { result: await runCLI(args, preload), requests };
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

export const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text();

export const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=UTF-8" } });

/** The `{ error, code }` object a failing command writes to stderr, or {} if it isn't JSON. */
export function err(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

export function parseJSON<T = unknown>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(`CLI exited with code ${result.exitCode}. stderr: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Failed to parse JSON. stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
