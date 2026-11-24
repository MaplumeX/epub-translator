import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AppDatabase } from "../db.js";
import type { TranslationJobManager } from "../jobManager.js";

const StartTranslateSchema = z.object({
  retryFailed: z.boolean().optional(),
  skipPrescan: z.boolean().optional(),
});

const RetranslateSegmentSchema = z.object({
  instruction: z.string().max(400).optional(),
});

export function createTranslationRoutes(db: AppDatabase, jobs: TranslationJobManager): Hono {
  const app = new Hono();

  app.post("/:id/prescan/start", (c) => {
    const bookId = c.req.param("id");
    try {
      void jobs.startPrescan(bookId);
      return c.json({ started: true, book: db.getBook(bookId) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "启动预扫描失败" }, 400);
    }
  });

  app.post("/:id/prescan/stop", (c) => {
    const bookId = c.req.param("id");
    const stopped = jobs.pauseBook(bookId);
    return c.json({ stopped, book: db.getBook(bookId) });
  });

  app.post("/:id/translate/start", async (c) => {
    const bookId = c.req.param("id");
    const raw = await c.req.json().catch(() => ({}));
    const parsed = StartTranslateSchema.safeParse(raw ?? {});
    try {
      void jobs.startTranslation(bookId, parsed.success ? parsed.data : {});
      return c.json({ started: true, book: db.getBook(bookId) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "启动翻译失败" }, 400);
    }
  });

  app.post("/:id/translate/pause", (c) => {
    const bookId = c.req.param("id");
    const paused = jobs.pauseBook(bookId);
    return c.json({ paused, book: db.getBook(bookId) });
  });

  app.post("/:id/translate/reset", (c) => {
    const bookId = c.req.param("id");
    if (!db.getBook(bookId)) return c.json({ error: "书籍不存在" }, 404);
    jobs.pauseBook(bookId);
    db.resetAllTranslationsForBook(bookId);
    return c.json({ reset: true, book: db.getBook(bookId), chapters: db.listChapters(bookId) });
  });

  app.post("/:id/segments/:segmentId/retranslate", async (c) => {
    const bookId = c.req.param("id");
    const segmentId = c.req.param("segmentId");
    const raw = await c.req.json().catch(() => ({}));
    const parsed = RetranslateSegmentSchema.safeParse(raw ?? {});
    try {
      const segment = await jobs.retranslateSegment(
        bookId,
        segmentId,
        parsed.success ? parsed.data.instruction : undefined,
      );
      return c.json({
        segment,
        book: db.getBook(bookId),
        chapter: db.getChapter(segment.chapterId),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "单段重译失败" }, 400);
    }
  });

  app.get("/:id/events", (c) => {
    const bookId = c.req.param("id");
    if (!db.getBook(bookId)) {
      return c.json({ error: "书籍不存在" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = jobs.subscribe(bookId, (event) => {
        if (closed) return;
        void stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        void stream.writeSSE({ event: "ping", data: "{}" });
      }, 15_000);

      stream.onAbort(() => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      });

      const current = db.getBook(bookId);
      if (current) {
        await stream.writeSSE({
          event: "book_status",
          data: JSON.stringify({
            type: "book_status",
            bookId,
            status: current.status,
            prescanCompleted: current.prescanCompleted,
          }),
        });
      }

      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    });
  });

  return app;
}
