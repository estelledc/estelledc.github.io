import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sites = JSON.parse(readFileSync(join(root, "data/public-sites.json"), "utf8"));
const timeoutMs = Number(process.env.LIVE_PROBE_TIMEOUT_MS ?? 10000);

async function probe(site) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(site.url, {
      method: "GET",
      headers: { Range: "bytes=0-1023", "User-Agent": "Jason-Xun-showcase-release-probe/2.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    return { ...site, status: response.status, ok: response.ok || response.status === 206, finalUrl: response.url };
  } catch (error) {
    return { ...site, status: "ERROR", ok: false, error: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

const results = await Promise.all(sites.map(probe));
for (const result of results.sort((a, b) => a.publishOrder - b.publishOrder || a.name.localeCompare(b.name))) {
  const suffix = result.error ? ` · ${result.error}` : result.finalUrl !== result.url ? ` · → ${result.finalUrl}` : "";
  console.log(`${result.ok ? "PASS" : "FAIL"} · wave ${result.publishOrder} · ${String(result.status).padEnd(5)} · ${result.name} · ${result.url}${suffix}`);
}

const failures = results.filter((result) => !result.ok);
if (failures.length) {
  console.error(`\nPublication probe blocked: ${failures.length}/${results.length} public sites are not reachable.`);
  process.exit(1);
}
console.log(`\nPublication probe passed: ${results.length}/${results.length} public sites are reachable.`);
