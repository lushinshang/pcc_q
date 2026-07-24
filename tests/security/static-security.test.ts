import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory())
      files.push(...(await sourceFiles(path)));
    else files.push(path);
  }
  return files;
}

describe("REQ-S-002/007 static frontend security", () => {
  it("STATIC-T-001 uses a restrictive Pages-compatible CSP without inline script or eval", async () => {
    const html = await readFile("index.html", "utf8");
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(
      html,
    )?.[1];

    expect(csp).toBeDefined();
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
  });

  it("STATIC-T-002 contains no server, Gemini, runtime PCC fetch, or raw HTML rendering", async () => {
    await expect(stat("server.ts")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat("src/services/geminiService.ts")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const files = [
      ...(await sourceFiles("src")),
      ...(await sourceFiles("scripts")),
      "package.json",
      "vite.config.ts",
    ];
    const combined = (
      await Promise.all(files.map((file) => readFile(file, "utf8")))
    ).join("\n");

    const packageManifest = JSON.parse(
      await readFile("package.json", "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...packageManifest.dependencies,
      ...packageManifest.devDependencies,
    };
    expect(dependencies).not.toHaveProperty("@google/genai");
    expect(dependencies).not.toHaveProperty("express");
    expect(dependencies).not.toHaveProperty("dotenv");
    expect(combined).not.toMatch(
      /from\s+["'](?:@google\/genai|express|dotenv)["']/,
    );
    expect(combined).not.toContain("dangerouslySetInnerHTML");
    expect(combined).not.toContain("/api/tenders");
    const frontendAndBuildConfig = (
      await Promise.all(
        [...(await sourceFiles("src")), "vite.config.ts"].map((file) =>
          readFile(file, "utf8"),
        ),
      )
    ).join("\n");
    expect(frontendAndBuildConfig).not.toMatch(
      /VITE_GEMINI|GEMINI_API_KEY|process\.env\.API_KEY/,
    );
  });

  it("STATIC-T-003 disables production source maps", async () => {
    const config = await readFile("vite.config.ts", "utf8");
    expect(config).toMatch(/sourcemap:\s*false/);
  });

  it("STATIC-T-004 pins the Git-history scanner and enables redaction", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.["security:history"]).toContain(
      "github.com/zricethezav/gitleaks/v8@v8.30.1",
    );
    expect(manifest.scripts?.["security:history"]).toContain("--redact");
  });
});
