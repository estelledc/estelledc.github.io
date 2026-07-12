import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const requiredRoutes = [
  "index.html",
  "work/index.html",
  "work/quanzhiping/index.html",
  "work/bj-pal/index.html",
  "work/study/index.html",
  "work/zero-to-ai/index.html",
  "work/embodied-ai/index.html",
  "work/xiaochai/index.html",
  "about/index.html",
  "resume/index.html",
  "404.html",
];

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (name === ".git" || name === "node_modules") return [];
    const absolute = join(directory, name);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function resolveInternalTarget(value) {
  const clean = value.split("#")[0].split("?")[0];
  if (!clean) return null;
  const pathname = clean.startsWith("/") ? clean.slice(1) : clean;
  if (!pathname) return join(root, "index.html");
  const absolute = join(root, pathname);
  if (extname(pathname)) return absolute;
  if (pathname.endsWith("/")) return join(absolute, "index.html");
  return existsSync(absolute) && statSync(absolute).isDirectory()
    ? join(absolute, "index.html")
    : absolute;
}

for (const route of requiredRoutes) {
  if (!existsSync(join(root, route))) fail(route, "required route is missing");
}

const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));
const requiredHeadPatterns = [
  [/<html\s+lang="(?:zh-CN|en)"/i, "document language"],
  [/<meta\s+name="viewport"/i, "viewport metadata"],
  [/<meta\s+name="description"/i, "description metadata"],
  [/<link\s+rel="canonical"/i, "canonical URL"],
  [/<meta\s+property="og:title"/i, "Open Graph title"],
  [/<meta\s+property="og:description"/i, "Open Graph description"],
  [/<meta\s+property="og:url"/i, "Open Graph URL"],
  [/<meta\s+property="og:image"/i, "Open Graph image"],
  [/<meta\s+name="twitter:card"/i, "Twitter card"],
  [/<meta\s+name="twitter:title"/i, "Twitter title"],
  [/<meta\s+name="twitter:description"/i, "Twitter description"],
  [/<meta\s+name="twitter:image"/i, "Twitter image"],
  [/<script\s+type="application\/ld\+json"/i, "JSON-LD"],
];

for (const absolute of htmlFiles) {
  const file = relative(root, absolute);
  const html = readFileSync(absolute, "utf8");

  if (!/^<!doctype html>/i.test(html.trimStart())) fail(file, "missing HTML5 doctype");
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(file, "missing non-empty title");
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  if (h1Count !== 1) fail(file, `expected exactly one h1, found ${h1Count}`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) fail(file, `duplicate id(s): ${[...new Set(duplicateIds)].join(", ")}`);
  for (const [pattern, label] of requiredHeadPatterns) {
    if (!pattern.test(html)) fail(file, `missing ${label}`);
  }

  const jsonLdBlocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLdBlocks) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail(file, `invalid JSON-LD (${error.message})`);
    }
  }

  for (const match of html.matchAll(/<(a|link)\b[^>]*\bhref="([^"]+)"[^>]*>/gi)) {
    const [, tag, href] = match;
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(href)) continue;
    if (href.startsWith("#")) {
      const fragment = href.slice(1);
      if (fragment && !html.includes(`id="${fragment}"`)) fail(file, `broken local fragment: ${href}`);
      continue;
    }
    const target = resolveInternalTarget(href);
    if (target && !existsSync(target)) fail(file, `broken internal ${tag} href: ${href}`);
    const fragment = href.includes("#") ? href.split("#")[1].split("?")[0] : "";
    if (fragment && target && existsSync(target) && target.endsWith(".html")) {
      const targetHtml = readFileSync(target, "utf8");
      if (!targetHtml.includes(`id="${fragment}"`)) fail(file, `broken target fragment: ${href}`);
    }
  }

  for (const match of html.matchAll(/<(?:img|script)\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
    const src = match[1];
    if (/^(?:https?:|data:)/i.test(src)) continue;
    const target = resolveInternalTarget(src);
    if (target && !existsSync(target)) fail(file, `broken internal src: ${src}`);
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\balt="[^"]+"/i.test(tag)) fail(file, "image is missing a useful alt attribute");
    if (!/\bwidth="\d+"/i.test(tag) || !/\bheight="\d+"/i.test(tag)) {
      fail(file, "image is missing intrinsic width or height");
    }
    if (!/\bdecoding="async"/i.test(tag)) fail(file, "image is missing decoding=async");
    if (!/\bloading="lazy"/i.test(tag) && !/\bfetchpriority="high"/i.test(tag)) {
      fail(file, "image needs lazy loading or explicit high fetch priority");
    }
  }

  if (/"@type"\s*:\s*"Person"/.test(html) && /"name"\s*:\s*"Jason Xun"/.test(html)) {
    if (!html.includes('"@id": "https://estelledc.github.io/#person"')) {
      fail(file, "Jason Xun structured identity is missing the canonical Person @id");
    }
  }
  if (/"name"\s*:\s*"Jason(?: Zhou| Xu)?"/.test(html)) {
    fail(file, "contains an inconsistent public author name");
  }
  if (/<footer[\s\S]*?>[\s\S]*?<time[^>]*>Verified ·/i.test(html)) {
    fail(file, "page-review timestamp must not be presented as outcome verification");
  }

  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    if (!/\brel="[^"]*noopener[^"]*"/i.test(match[0])) fail(file, "external target=_blank link is missing rel=noopener");
  }
}

const caseFiles = requiredRoutes.filter((route) => route.startsWith("work/") && route !== "work/index.html");
for (const file of caseFiles) {
  const html = readFileSync(join(root, file), "utf8");
  for (const marker of ["case-facts", "english-summary", "jx-case-question", 'id="evidence"', 'id="limits"', "status-chip"]) {
    if (!html.includes(marker)) fail(file, `case contract missing ${marker}`);
  }
}

const publicBoundaryMarkers = {
  "work/bj-pal/index.html": ["KeepL", "Claude Code", "Prototype boundary"],
  "work/study/index.html": ["AI 协作", "Content boundary"],
  "work/embodied-ai/index.html": ["AI 辅助", "Research boundary"],
  "work/xiaochai/index.html": ["源码私有", "不公开源码仓库地址"],
  "resume/index.html": ["No private contact data", "与 KeepL 共同完成"],
};

for (const [file, markers] of Object.entries(publicBoundaryMarkers)) {
  const html = readFileSync(join(root, file), "utf8");
  for (const marker of markers) {
    if (!html.includes(marker)) fail(file, `public boundary contract missing ${marker}`);
  }
}

const workIndex = readFileSync(join(root, "work/index.html"), "utf8");
const homePage = readFileSync(join(root, "index.html"), "utf8");
const evidenceManifest = JSON.parse(readFileSync(join(root, "data/evidence.json"), "utf8"));
const publicSites = JSON.parse(readFileSync(join(root, "data/public-sites.json"), "utf8"));
const siteCss = readFileSync(join(root, "assets/site.css"), "utf8");
const designSystemVersion = readFileSync(join(root, "assets/jx/VERSION"), "utf8").trim();

if (designSystemVersion !== "2.2.0") fail("assets/jx/VERSION", "expected Jason DS 2.2.0");
for (const [pattern, label] of [
  [/\btransition\s*:\s*all\b/i, "transition: all"],
  [/\bscale\(\s*0(?:\.0+)?\s*\)/i, "scale(0)"],
  [/(?<![-\w])ease-in(?![-\w])/i, "UI ease-in"],
  [/transition-duration:\s*0\.01ms/i, "global zero-duration motion reset"],
]) {
  if (pattern.test(siteCss)) fail("assets/site.css", `motion contract forbids ${label}`);
}
for (const marker of [
  "@media (hover: hover) and (pointer: fine)",
  "@media (prefers-reduced-motion: reduce)",
  "@media (prefers-reduced-transparency: reduce)",
]) {
  if (!siteCss.includes(marker)) fail("assets/site.css", `motion contract missing ${marker}`);
}
for (const marker of [
  '"@type": "ProfilePage"',
  '"mainEntity": { "@id": "https://estelledc.github.io/#person" }',
  "Comparable evidence / 04",
  "Systems over isolated screens.",
  "UIKit Lifecycle Lab",
  "HardwareDecoder",
]) {
  if (!homePage.includes(marker)) fail("index.html", `round-two identity contract missing ${marker}`);
}
const publicEntryContracts = [
  ["https://www.thyself.cc/", "Thyself"],
  ["https://www.bilibili.com/video/BV1Pv1EB3EQT", "触见千年"],
  ["https://estelledc.github.io/practicemate/", "PracticeMate"],
  ["https://github.com/estelledc/doubao-auto-system-theme", "豆包主题适配器"],
  ["https://estelledc.github.io/rhino-bird-2026/", "犀牛鸟 2026"],
  ["https://estelledc.github.io/langchain-langgraph-langsmith-tutorial/", "LangChain 教程"],
  ["https://estelledc.github.io/iot/", "IoT 全栈学习站"],
  ["https://estelledc.github.io/after-reading/", "After Reading"],
  ["https://estelledc.github.io/hust-eic-os-review/", "操作系统"],
  ["https://estelledc.github.io/hust-eic-microwave-from-scratch/", "微波技术"],
  ["https://estelledc.github.io/HardwareDecoder/", "HardwareDecoder"],
  ["https://estelledc.github.io/UIKitLifecycleDemo/", "UIKit Lifecycle Lab"],
  ["https://estelledc.github.io/my_mips/", "my_mips"],
];

for (const [url, label] of publicEntryContracts) {
  if (!workIndex.includes(`href="${url}"`)) fail("work/index.html", `public entry is missing: ${label}`);
}

const satelliteLists = [...workIndex.matchAll(/<ul class="satellite-list">([\s\S]*?)<\/ul>/g)];
if (!satelliteLists.length) {
  fail("work/index.html", "More public work list is missing");
} else {
  const itemCount = satelliteLists.reduce((count, list) => count + [...list[1].matchAll(/<li>/g)].length, 0);
  if (itemCount !== publicEntryContracts.length) {
    fail("work/index.html", `expected ${publicEntryContracts.length} public entries, found ${itemCount}`);
  }
}

for (const marker of ["Product systems", "Learning & explanation", "Engineering labs", 'id="engineering-labs"']) {
  if (!workIndex.includes(marker)) fail("work/index.html", `round-two work family is missing: ${marker}`);
}

for (const [key, evidence] of Object.entries(evidenceManifest)) {
  const contract = new RegExp(
    `<a[^>]+href="${evidence.sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]+data-evidence-key="${key}"[\\s\\S]*?<strong>${evidence.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</strong>`,
  );
  if (!contract.test(homePage)) fail("index.html", `evidence manifest drift: ${key}`);
}
if (new Set(publicSites.map((site) => site.url)).size !== publicSites.length) {
  fail("data/public-sites.json", "public site URLs must be unique");
}
if (publicSites.length !== 16 || !publicSites.every((site) => [1, 2, 3].includes(site.publishOrder))) {
  fail("data/public-sites.json", "expected 16 frontends assigned to publication waves 1–3");
}

for (const [fragment, label] of [["product-cases", "Product systems"], ["learning-cases", "Learning systems"], ["engineering-labs", "Engineering labs"]]) {
  if (!workIndex.includes(`href="#${fragment}"`) || !workIndex.includes(`id="${fragment}"`)) {
    fail("work/index.html", `${label} lens does not resolve to its own section`);
  }
}

const siblingRoot = resolve(root, "..");
const localEvidenceContracts = [
  {
    key: "bj-pal-final-pass",
    file: join(siblingRoot, "bj-pal/docs/eval-100-results.md"),
    verify: (source) => /final_pass[^\n]*47\/100|47\/100[^\n]*final_pass/i.test(source),
  },
  {
    key: "uikit-ui-tests",
    file: join(siblingRoot, "UIKitLifecycleDemo/UIKitLifecycleDemoUITests/UIKitLifecycleDemoUITests.swift"),
    verify: (source) => [...source.matchAll(/^\s*func\s+test\w+\s*\(/gm)].length === 2,
  },
  {
    key: "hardwaredecoder-xctest",
    files: ["H264StreamTests.swift", "IDRIndexTests.swift", "SPSParserTests.swift"].map((name) => join(siblingRoot, "HardwareDecoder/Tests/HardwareDecoderCoreTests", name)),
    verify: (source) => [...source.matchAll(/\bfunc\s+test[A-Za-z0-9_]*\s*\(/g)].length === 12,
  },
];

for (const contract of localEvidenceContracts) {
  const files = contract.files ?? [contract.file];
  if (!files.every(existsSync)) continue;
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  if (!contract.verify(source)) fail("data/evidence.json", `local evidence drift: ${contract.key}`);
}

if (!workIndex.includes("这里负责长期可发现")) {
  fail("work/index.html", "durable public-entry positioning is missing");
}
if (workIndex.includes("第一批重构")) {
  fail("work/index.html", "contains time-bound rollout copy");
}

const textFiles = walk(root).filter((file) => [".html", ".css", ".js", ".xml", ".txt"].includes(extname(file)));
const forbiddenPatterns = [
  [/\/Users\//g, "local absolute user path"],
  [/internal-corp/gi, "internal domain marker"],
  [/@(?:bytedance|meituan)\.com/gi, "private corporate email"],
  [/DEVELOPMENT_TEAM\s*=/g, "local signing identifier"],
  [/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/g, "private key material"],
];
for (const absolute of textFiles) {
  const file = relative(root, absolute);
  const contents = readFileSync(absolute, "utf8");
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(contents)) fail(file, `contains ${label}`);
    pattern.lastIndex = 0;
  }
}

if (errors.length) {
  console.error(`Site validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML pages, ${requiredRoutes.length} required routes, ${publicEntryContracts.length} public entries, internal links, metadata, JSON-LD, images, and public-safety markers.`);
