import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { AppDatabase } from "./db.js";
import { TranslationJobManager, type ProviderFactory } from "./jobManager.js";
import { createBooksRoutes } from "./routes/books.js";
import { createGlossaryRoutes } from "./routes/glossary.js";
import { createProvidersRoutes } from "./routes/providers.js";
import { createTranslationRoutes } from "./routes/translation.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

export interface CreateServerAppOptions {
  db: AppDatabase;
  providerFactory?: ProviderFactory;
  staticDir?: string;
}

export function createServerApp(options: CreateServerAppOptions): {
  app: Hono;
  jobs: TranslationJobManager;
} {
  const app = new Hono();
  const jobs = new TranslationJobManager(options.db, options.providerFactory);

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.route("/api/books", createBooksRoutes(options.db, jobs));
  app.route("/api/books", createTranslationRoutes(options.db, jobs));
  app.route("/api/books", createGlossaryRoutes(options.db));
  app.route("/api/providers", createProvidersRoutes(options.db, jobs));

  // Serve built static frontend assets when dist/web exists
  const staticDir = options.staticDir ? path.resolve(options.staticDir) : null;
  if (staticDir && fs.existsSync(staticDir)) {
    app.get("*", (c) => {
      if (c.req.path.startsWith("/api/")) {
        return c.json({ error: "Not Found" }, 404);
      }
      const cleanPath = path.normalize(c.req.path).replace(/^(\.\.(\/|\\|$))+/, "");
      let filePath = path.join(staticDir, cleanPath === "/" ? "index.html" : cleanPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(staticDir, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        return c.text("Frontend build not found. Run `pnpm run build` first.", 404);
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    });
  }

  return { app, jobs };
}
