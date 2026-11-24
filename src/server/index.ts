import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createServerApp } from "./app.js";
import { AppDatabase } from "./db.js";

// Binding strictly to 127.0.0.1 prevents exposing local API keys and file access on LAN interfaces.
// See ADR 2026-11-24-epub-translator-architecture.
const LOOPBACK_HOST = "127.0.0.1";

function loadOptionalDotEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadOptionalDotEnv(path.resolve(process.cwd(), ".env"));

const port = Number(process.env.PORT ?? "3456") || 3456;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const staticDir = path.resolve(process.cwd(), "dist/web");

const db = new AppDatabase(dataDir);
const { app } = createServerApp({ db, staticDir });

serve(
  {
    fetch: app.fetch,
    hostname: LOOPBACK_HOST,
    port,
  },
  (info) => {
    console.log(`EPUB Translator running at http://${LOOPBACK_HOST}:${info.port}`);
  },
);
