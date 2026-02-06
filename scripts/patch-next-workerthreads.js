/* eslint-disable no-console */
/**
 * Patch Next.js 16.x to work with `experimental.workerThreads: true` in our environment.
 *
 * Why:
 * - Next.js passes `nextConfig` + `options` to export workers.
 * - Those objects can contain functions (e.g. `generateBuildId`, `exportPathMap`).
 * - `worker_threads` uses structured clone, which cannot clone functions -> DataCloneError.
 *
 * This script strips function properties from the objects passed to the worker by:
 * - Passing `nextConfigForWorker` (JSON-cloned) instead of `nextConfig`
 * - Passing `optionsForWorker` (with `nextConfig` cleared) instead of `options`
 *
 * It's intentionally small and fails loudly if Next.js changes its output enough that we
 * can no longer patch reliably.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const TARGETS = [
  path.join(ROOT, "node_modules", "next", "dist", "export", "index.js"),
  path.join(ROOT, "node_modules", "next", "dist", "esm", "export", "index.js"),
];

const MARKER = "const nextConfigForWorker = JSON.parse(JSON.stringify(nextConfig));";

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-next-workerthreads] skip (missing): ${filePath}`);
    return;
  }

  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(MARKER)) {
    console.log(`[patch-next-workerthreads] already patched: ${filePath}`);
    return;
  }

  const distDirNeedle = "const distDir =";
  const distDirIndex = original.indexOf(distDirNeedle);
  if (distDirIndex === -1) {
    throw new Error(
      `[patch-next-workerthreads] could not find "${distDirNeedle}" in ${filePath}`
    );
  }

  const lineStart = original.lastIndexOf("\n", distDirIndex) + 1;
  const indent = original.slice(lineStart, distDirIndex).match(/^\s*/)?.[0] ?? "";

  const patchBlock =
    `${indent}// When Next.js runs build/export workers using \`worker_threads\`, the arguments sent to the\n` +
    `${indent}// worker must be structured-cloneable. \`nextConfig\` can contain functions (e.g. \`generateBuildId\`,\n` +
    `${indent}// and in production builds \`exportPathMap\`) which are not cloneable and will crash the build.\n` +
    `${indent}const nextConfigForWorker = JSON.parse(JSON.stringify(nextConfig));\n` +
    `${indent}// \`options\` can also contain \`nextConfig\` (passed from \`next build\`), so ensure we don't forward\n` +
    `${indent}// function properties through it either.\n` +
    `${indent}const optionsForWorker = {\n` +
    `${indent}    ...options,\n` +
    `${indent}    nextConfig: undefined\n` +
    `${indent}};\n`;

  let next = original.slice(0, distDirIndex) + patchBlock + original.slice(distDirIndex);

  const optionsNeedle = "renderOpts,\n                options,";
  if (!next.includes(optionsNeedle)) {
    throw new Error(
      `[patch-next-workerthreads] could not find export worker options callsite in ${filePath}`
    );
  }
  next = next.replace(optionsNeedle, "renderOpts,\n                options: optionsForWorker,");

  const nextConfigNeedle = "outDir,\n                nextConfig,";
  if (!next.includes(nextConfigNeedle)) {
    throw new Error(
      `[patch-next-workerthreads] could not find export worker nextConfig callsite in ${filePath}`
    );
  }
  next = next.replace(nextConfigNeedle, "outDir,\n                nextConfig: nextConfigForWorker,");

  fs.writeFileSync(filePath, next, "utf8");
  console.log(`[patch-next-workerthreads] patched: ${filePath}`);
}

function main() {
  for (const filePath of TARGETS) patchFile(filePath);
}

main();

