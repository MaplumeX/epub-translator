import { Hono } from "hono";
import { z } from "zod";
import { OpenAICompatibleProvider } from "../../core/translation/index.js";
import type { AppDatabase } from "../db.js";
import { toPublicProvider } from "../db.js";
import type { TranslationJobManager } from "../jobManager.js";

const UpsertProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "名称不能为空"),
  baseUrl: z.string().url("请输入合法的 Base URL"),
  apiKey: z.string().optional(),
  model: z.string().min(1, "模型名不能为空"),
  concurrency: z.number().int().min(1).max(10).optional(),
  maxBatchChars: z.number().int().min(600).max(10000).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  isActive: z.boolean().optional(),
});

const TestProviderSchema = z.object({
  id: z.string().optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1).optional(),
});

export function createProvidersRoutes(db: AppDatabase, jobs: TranslationJobManager): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const providers = db.listProviders().map(toPublicProvider);
    return c.json({ providers });
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = UpsertProviderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, 400);
    }
    const saved = db.upsertProvider(parsed.data);
    return c.json({ provider: toPublicProvider(saved) }, 201);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.getProviderById(id);
    if (!existing) return c.json({ error: "预设不存在" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = UpsertProviderSchema.partial().safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, 400);
    }

    const saved = db.upsertProvider({
      id,
      name: parsed.data.name ?? existing.name,
      baseUrl: parsed.data.baseUrl ?? existing.baseUrl,
      apiKey: parsed.data.apiKey !== undefined && parsed.data.apiKey !== "" ? parsed.data.apiKey : existing.apiKey,
      model: parsed.data.model ?? existing.model,
      concurrency: parsed.data.concurrency ?? existing.concurrency,
      maxBatchChars: parsed.data.maxBatchChars ?? existing.maxBatchChars,
      temperature: parsed.data.temperature ?? existing.temperature,
      isActive: parsed.data.isActive,
    });
    return c.json({ provider: toPublicProvider(saved) });
  });

  app.post("/:id/activate", (c) => {
    const updated = db.setActiveProvider(c.req.param("id"));
    if (!updated) return c.json({ error: "预设不存在" }, 404);
    return c.json({ provider: toPublicProvider(updated) });
  });

  app.delete("/:id", (c) => {
    const ok = db.deleteProvider(c.req.param("id"));
    if (!ok) return c.json({ error: "预设不存在" }, 404);
    return c.json({ deleted: true });
  });

  app.post("/test", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = TestProviderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, latencyMs: 0, model: "", message: "请填写合法的 Base URL 与模型名" }, 400);
    }

    const saved = parsed.data.id ? db.getProviderById(parsed.data.id) : db.getActiveProvider();
    const baseUrl = parsed.data.baseUrl ?? saved?.baseUrl ?? "";
    const model = parsed.data.model ?? saved?.model ?? "";
    const apiKey = parsed.data.apiKey && parsed.data.apiKey.trim() ? parsed.data.apiKey : (saved?.apiKey ?? "");

    if (!baseUrl || !model) {
      return c.json({ ok: false, latencyMs: 0, model, message: "缺少 Base URL 或模型名" }, 400);
    }

    const provider =
      saved && !parsed.data.baseUrl && !parsed.data.apiKey && !parsed.data.model
        ? jobs.createProvider(saved)
        : new OpenAICompatibleProvider({ baseUrl, apiKey, model, maxRetries: 0, timeoutMs: 20_000 });

    const result = await provider.testConnection();
    return c.json(result, result.ok ? 200 : 200);
  });

  return app;
}
