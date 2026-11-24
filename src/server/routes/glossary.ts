import { Hono } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db.js";

const CreateTermSchema = z.object({
  sourceTerm: z.string().min(1, "原文术语不能为空"),
  targetTerm: z.string().min(1, "译文术语不能为空"),
  note: z.string().max(200).optional(),
});

const UpdateTermSchema = z.object({
  sourceTerm: z.string().min(1).optional(),
  targetTerm: z.string().min(1).optional(),
  note: z.string().max(200).optional(),
});

export function createGlossaryRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get("/:id/glossary", (c) => {
    const bookId = c.req.param("id");
    if (!db.getBook(bookId)) return c.json({ error: "书籍不存在" }, 404);
    return c.json({ terms: db.listGlossary(bookId) });
  });

  app.post("/:id/glossary", async (c) => {
    const bookId = c.req.param("id");
    if (!db.getBook(bookId)) return c.json({ error: "书籍不存在" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = CreateTermSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "参数错误" }, 400);
    }

    const added = db.addGlossaryTerms(bookId, [{ ...parsed.data, origin: "manual" }]);
    if (added.length === 0) {
      return c.json({ error: "该原文术语已存在" }, 409);
    }
    return c.json({ term: added[0] }, 201);
  });

  app.patch("/:id/glossary/:termId", async (c) => {
    const bookId = c.req.param("id");
    const termId = c.req.param("termId");
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateTermSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "参数错误" }, 400);
    }
    const updated = db.updateGlossaryTerm(bookId, termId, parsed.data);
    if (!updated) return c.json({ error: "术语不存在" }, 404);
    return c.json({ term: updated });
  });

  app.delete("/:id/glossary/:termId", (c) => {
    const ok = db.deleteGlossaryTerm(c.req.param("id"), c.req.param("termId"));
    if (!ok) return c.json({ error: "术语不存在" }, 404);
    return c.json({ deleted: true });
  });

  return app;
}
