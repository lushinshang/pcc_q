import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST_DIRECTORY = path.resolve("dist");
const FORBIDDEN_FILE_PATTERNS = [/\.map$/i, /(^|\/)\.env(?:\.|$)/i, /fixture/i];
const FORBIDDEN_CONTENT_PATTERNS: [string, RegExp][] = [
  ["Gemini API key marker", /GEMINI_API_KEY/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["GitHub classic token", /ghp_[0-9A-Za-z]{30,}/],
  ["GitHub fine-grained token", /github_pat_[0-9A-Za-z_]{30,}/],
  ["OpenAI-style secret", /\bsk-[0-9A-Za-z_-]{20,}/],
  ["session cookie", /JSESSIONID\s*=/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    if ((await stat(target)).isDirectory())
      files.push(...(await filesUnder(target)));
    else files.push(target);
  }
  return files;
}

async function main(): Promise<void> {
  const files = await filesUnder(DIST_DIRECTORY);
  const findings: string[] = [];
  for (const file of files) {
    const relative = path.relative(DIST_DIRECTORY, file);
    if (FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(relative))) {
      findings.push(`禁止發布的檔案：${relative}`);
      continue;
    }
    const content = await readFile(file, "utf8").catch(() => "");
    for (const [label, pattern] of FORBIDDEN_CONTENT_PATTERNS) {
      if (pattern.test(content)) findings.push(`${label}：${relative}`);
    }
  }

  if (findings.length > 0)
    throw new Error(`dist 安全掃描失敗\n${findings.join("\n")}`);
  console.info(`dist 安全掃描通過：${String(files.length)} 個檔案，零發現`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "dist 安全掃描失敗");
  process.exitCode = 1;
});
