import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("Architecture and design system guardrails", () => {
  it("keeps src/core free of React, Hono, node:sqlite, and server/web layer imports", () => {
    const coreFiles = listTsFiles(path.join(REPO_ROOT, "src/core"));
    expect(coreFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /from\s+["']react(?:\/|["'])/,
      /from\s+["']react-dom/,
      /from\s+["']hono/,
      /from\s+["']@hono\//,
      /from\s+["']node:sqlite["']/,
      /from\s+["']\.\.\/.*\/?(server|web)\//,
    ];

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(content, `${path.relative(REPO_ROOT, file)} violated core boundary ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("binds local server strictly to 127.0.0.1 loopback", () => {
    const serverEntry = fs.readFileSync(path.join(REPO_ROOT, "src/server/index.ts"), "utf8");
    expect(serverEntry).toContain('"127.0.0.1"');
    expect(serverEntry).not.toContain('"0.0.0.0"');
  });

  it("enforces Warm Editorial token invariants (no pure #000000, no side-border stripes, and dark theme semantic aliases)", () => {
    const tokensCss = fs
      .readFileSync(path.join(REPO_ROOT, "src/web/styles/tokens.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(tokensCss).not.toMatch(/#000000\b/i);
    expect(tokensCss).not.toMatch(/#000\s*;/);
    expect(tokensCss).toContain('[data-theme="dark"]');

    for (const cssFile of ["workbench.css", "overlays.css"]) {
      const css = fs.readFileSync(path.join(REPO_ROOT, "src/web/styles", cssFile), "utf8");
      expect(css, `${cssFile} must not use thick/colored left accent borders`).not.toMatch(
        /border-left:\s*[2-9]px/,
      );
    }
  });
});
