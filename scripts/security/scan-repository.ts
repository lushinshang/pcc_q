import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const FORBIDDEN_FILE_NAMES = [
  /^\.env(?:\.|$)/i,
  /\.(?:key|p12|pfx|pem)$/i,
  /^id_(?:rsa|ed25519)$/i,
];
const SECRET_PATTERNS: [string, RegExp][] = [
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["GitHub classic token", /ghp_[0-9A-Za-z]{30,}/],
  ["GitHub fine-grained token", /github_pat_[0-9A-Za-z_]{30,}/],
  ["OpenAI-style secret", /\bsk-[0-9A-Za-z_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["session cookie", /JSESSIONID\s*=\s*[^\s;]{8,}/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function main(): Promise<void> {
  const findings: string[] = [];
  const files = await filesUnder(ROOT);
  for (const file of files) {
    const relative = path.relative(ROOT, file);
    if (
      FORBIDDEN_FILE_NAMES.some((pattern) => pattern.test(path.basename(file)))
    ) {
      findings.push(`禁止納入 repository 的檔案：${relative}`);
      continue;
    }
    if ((await stat(file)).size > 2 * 1024 * 1024) continue;
    const content = await readFile(file, "utf8").catch(() => "");
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(content)) findings.push(`${label}：${relative}`);
    }
  }
  if (findings.length > 0) {
    throw new Error(`repository secret scan 失敗\n${findings.join("\n")}`);
  }
  console.info(
    `repository secret scan 通過：${String(files.length)} 個檔案，零發現`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "repository secret scan 失敗",
  );
  process.exitCode = 1;
});
