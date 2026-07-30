import { access, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist");

function artifactPath(pathname) {
  const path = resolve(root, pathname.replace(/^\//, ""));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`Artifact path escapes dist: ${pathname}`);
  }
  return path;
}

async function requireFile(pathname) {
  const path = artifactPath(pathname);
  await access(path);
  return path;
}

export async function validatePwaArtifacts() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(await requireFile("manifest.webmanifest"), "utf8"));
  } catch (error) {
    throw new Error(`Invalid manifest.webmanifest: ${error.message}`);
  }

  for (const field of ["name", "short_name", "start_url", "display"]) {
    if (typeof manifest[field] !== "string" || manifest[field].length === 0) {
      throw new Error(`Manifest requires ${field}`);
    }
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error("Manifest requires at least one icon");
  }
  await Promise.all(manifest.icons.map(async (icon) => {
    if (typeof icon.src !== "string" || icon.src.length === 0) {
      throw new Error("Every manifest icon requires src");
    }
    await requireFile(icon.src);
  }));

  await requireFile("push-handler.js");
  const worker = await readFile(await requireFile("sw.js"), "utf8");
  const requiredWorkerPolicy = [
    [/importScripts\(["']\/push-handler\.js["']\)/, "push-handler import"],
    [/precacheAndRoute\(/, "generated precache"],
    [/NavigationRoute\(/, "navigation fallback"],
    [/createHandlerBoundToURL\(["']index\.html["']\)/, "application-shell fallback"],
  ];
  for (const [pattern, label] of requiredWorkerPolicy) {
    if (!pattern.test(worker)) throw new Error(`Service worker lacks ${label}`);
  }

  const cachedUrls = [...worker.matchAll(/url:["']([^"']+)["']/g)].map((match) => match[1]);
  if (!cachedUrls.includes("push-handler.js") || !cachedUrls.includes("index.html")) {
    throw new Error("Service worker must precache the shell and push handler");
  }
  const unsafe = cachedUrls.find((url) => /^(?:https?:)?\/\//.test(url) || /(?:\/api\/|\/auth\/v1|\/rest\/v1|supabase)/i.test(url));
  if (unsafe) throw new Error(`Private or remote resource must not be precached: ${unsafe}`);

  console.log(`Validated PWA artifacts: ${manifest.icons.length} icons, ${cachedUrls.length} cached public assets.`);
}

validatePwaArtifacts().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
