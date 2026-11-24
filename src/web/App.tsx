import { useCallback, useEffect, useState } from "react";
import type {
  BookRecord,
  BookSseEvent,
  ChapterDocumentNode,
  ChapterRecord,
  GlossaryTerm,
  OutputMode,
  ProviderPresetPublic,
  SegmentRecord,
} from "../core/types.js";
import { api } from "./api/client.js";
import { BookImportEmpty } from "./components/BookImportEmpty.js";
import { ChapterReader } from "./components/ChapterReader.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { ExportPopover } from "./components/ExportPopover.js";
import { GlossaryDrawer } from "./components/GlossaryDrawer.js";
import { ProviderSettingsModal } from "./components/ProviderSettingsModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { TopActionBar } from "./components/TopActionBar.js";
import { WorkbenchShell } from "./components/WorkbenchShell.js";
import { useBookEvents } from "./hooks/useBookEvents.js";
import { useTheme } from "./hooks/useTheme.js";
import {
  detectPreviewState,
  PREVIEW_BOOKS,
  PREVIEW_CHAPTER_NODES,
  PREVIEW_CHAPTERS,
  PREVIEW_GLOSSARY,
  PREVIEW_PLACEHOLDER_NODES,
  PREVIEW_PROVIDERS,
  PREVIEW_SEGMENTS,
} from "./previewData.js";

export function App() {
  const previewState = detectPreviewState();
  const { theme, toggleTheme } = useTheme();

  const [books, setBooks] = useState<BookRecord[]>(() =>
    previewState === "default" || previewState === "loading" || previewState === "error"
      ? PREVIEW_BOOKS
      : [],
  );
  const [activeBookId, setActiveBookId] = useState<string | null>(() =>
    previewState === "default" || previewState === "loading" || previewState === "error"
      ? PREVIEW_BOOKS[0].id
      : null,
  );
  const [chapters, setChapters] = useState<ChapterRecord[]>(() =>
    previewState === "default" || previewState === "loading" || previewState === "error"
      ? PREVIEW_CHAPTERS
      : [],
  );
  const [activeChapterId, setActiveChapterId] = useState<string | null>(() =>
    previewState === "default" || previewState === "loading" || previewState === "error"
      ? PREVIEW_CHAPTERS[1].id
      : null,
  );
  const [chapterNodes, setChapterNodes] = useState<ChapterDocumentNode[]>(() =>
    previewState === "default" ? PREVIEW_CHAPTER_NODES : [],
  );
  const [placeholderNodes, setPlaceholderNodes] = useState<
    Record<string, Record<string, ChapterDocumentNode[]>>
  >(() => (previewState === "default" ? PREVIEW_PLACEHOLDER_NODES : {}));
  const [docFallback, setDocFallback] = useState(false);
  const [segments, setSegments] = useState<SegmentRecord[]>(() =>
    previewState === "default" ? PREVIEW_SEGMENTS : [],
  );
  const [glossary, setGlossary] = useState<GlossaryTerm[]>(() =>
    previewState === "default" ? PREVIEW_GLOSSARY : [],
  );
  const [providers, setProviders] = useState<ProviderPresetPublic[]>(() =>
    previewState ? PREVIEW_PROVIDERS : [],
  );

  const [segmentFilter, setSegmentFilter] = useState<"all" | "failed">("all");
  const [highlightedDomPath, setHighlightedDomPath] = useState<string | null>(null);
  const [pendingAnchorHash, setPendingAnchorHash] = useState<string | null>(null);
  const [loadingReader, setLoadingReader] = useState(previewState === "loading");
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    previewState === "error"
      ? "本地服务连接中断（127.0.0.1:3456 无响应），已保留本地进度，请确认服务已启动后点击重试。"
      : null,
  );
  const [prescanBanner, setPrescanBanner] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Overlays
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"reset" | "delete" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const activeBook = books.find((b) => b.id === activeBookId) ?? null;
  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null;
  const activeProvider = providers.find((p) => p.isActive) ?? providers[0] ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const loadBootstrap = useCallback(async () => {
    if (previewState) return;
    setErrorMessage(null);
    try {
      const [{ books: bookList }, { providers: providerList }] = await Promise.all([
        api.listBooks(),
        api.listProviders(),
      ]);
      setBooks(bookList);
      setProviders(providerList);
      if (bookList.length > 0) {
        setActiveBookId((curr) =>
          curr && bookList.some((b) => b.id === curr) ? curr : bookList[0].id,
        );
      } else {
        setActiveBookId(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "加载书库失败");
    }
  }, [previewState]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const loadBookDetails = useCallback(
    async (bookId: string) => {
      if (previewState) return;
      setLoadingReader(true);
      setErrorMessage(null);
      try {
        const [{ book, chapters: chList }, { terms }] = await Promise.all([
          api.getBook(bookId),
          api.listGlossary(bookId),
        ]);
        setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
        setChapters(chList);
        setGlossary(terms);
        setActiveChapterId((curr) =>
          curr && chList.some((c) => c.id === curr) ? curr : chList[0]?.id ?? null,
        );
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "加载书籍详情失败");
      } finally {
        setLoadingReader(false);
      }
    },
    [previewState],
  );

  useEffect(() => {
    if (activeBookId && !previewState) {
      void loadBookDetails(activeBookId);
    }
  }, [activeBookId, loadBookDetails, previewState]);

  const loadChapterDocument = useCallback(
    async (bookId: string, chapterId: string) => {
      if (previewState) return;
      setLoadingReader(true);
      setErrorMessage(null);
      try {
        const doc = await api.getChapterDocument(bookId, chapterId);
        setChapters((prev) => prev.map((c) => (c.id === doc.chapter.id ? doc.chapter : c)));
        setChapterNodes(doc.nodes);
        setPlaceholderNodes(doc.placeholderNodes);
        setDocFallback(doc.fallback);
        setSegments(doc.segments);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "加载章节内容失败");
      } finally {
        setLoadingReader(false);
      }
    },
    [previewState],
  );

  useEffect(() => {
    if (activeBookId && activeChapterId && !previewState) {
      void loadChapterDocument(activeBookId, activeChapterId);
    }
  }, [activeBookId, activeChapterId, loadChapterDocument, previewState]);

  const handleSseEvent = useCallback(
    (event: BookSseEvent) => {
      if (event.type === "prescan_progress") {
        setPrescanBanner(`预扫描 ${event.completedChapters}/${event.totalChapters} 章`);
        if (event.termsAdded > 0 && activeBookId) {
          void api
            .listGlossary(activeBookId)
            .then((r) => setGlossary(r.terms))
            .catch(() => {});
        }
        return;
      }

      if (event.type === "book_status") {
        setBooks((prev) =>
          prev.map((b) =>
            b.id === event.bookId
              ? {
                  ...b,
                  status: event.status,
                  prescanCompleted: event.prescanCompleted ?? b.prescanCompleted,
                }
              : b,
          ),
        );
        if (event.status !== "prescanning") {
          setPrescanBanner(null);
        }
        if (event.message) {
          showToast(event.message);
        }
        if (event.status === "completed" || event.status === "idle") {
          void loadBookDetails(event.bookId);
        }
        return;
      }

      if (event.type === "segment_updated") {
        setBooks((prev) =>
          prev.map((b) => (b.id === event.bookId ? { ...b, ...event.bookStats } : b)),
        );
        setChapters((prev) =>
          prev.map((c) =>
            c.id === event.chapterStats.chapterId ? { ...c, ...event.chapterStats } : c,
          ),
        );
        if (event.chapterId === activeChapterId) {
          setSegments((prev) => {
            const exists = prev.some((s) => s.id === event.segment.id);
            if (!exists) return prev;
            return prev.map((s) => (s.id === event.segment.id ? event.segment : s));
          });
        }
      }
    },
    [activeBookId, activeChapterId, loadBookDetails, segmentFilter, showToast],
  );

  useBookEvents(activeBookId, !previewState && Boolean(activeBookId), handleSseEvent);

  async function handleUploadFile(file: File) {
    if (previewState) return;
    setUploading(true);
    setErrorMessage(null);
    try {
      const { book, chapters: chList } = await api.importEpub(file);
      setBooks((prev) => [book, ...prev]);
      setActiveBookId(book.id);
      setChapters(chList);
      setActiveChapterId(chList[0]?.id ?? null);
      setSegmentFilter("all");
      showToast(`已导入《${book.title}》（${book.totalSegments} 段）`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "EPUB 导入失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleChangeOutputMode(mode: OutputMode) {
    if (!activeBook) return;
    setBooks((prev) => prev.map((b) => (b.id === activeBook.id ? { ...b, outputMode: mode } : b)));
    if (previewState) return;
    try {
      const { book } = await api.updateBook(activeBook.id, { outputMode: mode });
      setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "更新模式失败");
    }
  }

  async function handleTogglePrescanEnabled(enabled: boolean) {
    if (!activeBook) return;
    setBooks((prev) =>
      prev.map((b) => (b.id === activeBook.id ? { ...b, prescanEnabled: enabled } : b)),
    );
    if (previewState) return;
    const { book } = await api.updateBook(activeBook.id, { prescanEnabled: enabled });
    setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
  }

  async function handleStartPrescan() {
    if (!activeBook || previewState) return;
    setErrorMessage(null);
    try {
      const { book } = await api.startPrescan(activeBook.id);
      setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "启动预扫描失败");
      setGlossaryOpen(false);
    }
  }

  async function handleStopPrescan() {
    if (!activeBook || previewState) return;
    await api.stopPrescan(activeBook.id);
  }

  async function handleStartOrResume(retryFailed = false) {
    if (!activeBook || previewState) return;
    setErrorMessage(null);
    try {
      const { book } = await api.startTranslation(activeBook.id, { retryFailed });
      setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "启动翻译失败");
    }
  }

  async function handlePause() {
    if (!activeBook || previewState) return;
    try {
      await api.pauseTranslation(activeBook.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "暂停失败");
    }
  }

  async function handleSaveSegment(segmentId: string, translatedTemplate: string) {
    if (!activeBook) return;
    if (previewState) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId
            ? {
                ...s,
                translatedTemplate,
                translatedPlain: translatedTemplate,
                status: "translated",
                errorMessage: null,
              }
            : s,
        ),
      );
      return;
    }
    const { segment, book, chapter } = await api.editSegment(
      activeBook.id,
      segmentId,
      translatedTemplate,
    );
    setSegments((prev) => prev.map((s) => (s.id === segment.id ? segment : s)));
    setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
    setChapters((prev) => prev.map((c) => (c.id === chapter.id ? chapter : c)));
    showToast("已保存段落修改");
  }

  async function handleRetranslateSegment(segmentId: string, instruction?: string) {
    if (!activeBook || previewState) return;
    const { segment, book, chapter } = await api.retranslateSegment(
      activeBook.id,
      segmentId,
      instruction,
    );
    setSegments((prev) => prev.map((s) => (s.id === segment.id ? segment : s)));
    setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
    setChapters((prev) => prev.map((c) => (c.id === chapter.id ? chapter : c)));
    showToast(segment.status === "translated" ? "单段重译完成" : "单段重译未通过校验");
  }

  async function handleAddTerm(input: { sourceTerm: string; targetTerm: string; note?: string }) {
    if (!activeBook) return;
    if (previewState) {
      const now = new Date().toISOString();
      setGlossary((prev) => [
        {
          id: `preview-term-${Date.now()}`,
          bookId: activeBook.id,
          sourceTerm: input.sourceTerm,
          targetTerm: input.targetTerm,
          note: input.note ?? "",
          origin: "manual",
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
      return;
    }
    const { term } = await api.addGlossaryTerm(activeBook.id, input);
    setGlossary((prev) => [term, ...prev]);
    showToast(`已添加术语「${term.sourceTerm}」`);
  }

  async function handleDeleteTerm(termId: string) {
    if (!activeBook) return;
    if (previewState) {
      setGlossary((prev) => prev.filter((t) => t.id !== termId));
      return;
    }
    await api.deleteGlossaryTerm(activeBook.id, termId);
    setGlossary((prev) => prev.filter((t) => t.id !== termId));
  }

  async function handleSaveProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    concurrency: number;
    maxBatchChars: number;
    temperature: number;
    isActive: boolean;
  }) {
    if (previewState) {
      showToast(`已切换为 ${input.name}（预览模式）`);
      return;
    }
    if (input.id) {
      await api.updateProvider(input.id, input);
      await api.activateProvider(input.id);
    } else {
      await api.createProvider(input);
    }
    const { providers: updated } = await api.listProviders();
    setProviders(updated);
    showToast(`已启用 ${input.name}（${input.model}）`);
  }

  async function handleDeleteProvider(id: string) {
    if (previewState) return;
    await api.deleteProvider(id);
    const { providers: updated } = await api.listProviders();
    setProviders(updated);
    showToast("已删除预设");
  }

  async function handleTestProvider(input: {
    id?: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
  }) {
    if (previewState) {
      return { ok: true, latencyMs: 142, model: input.model, message: "连接成功（预览模拟）" };
    }
    return api.testProvider(input);
  }

  async function handleConfirmAction() {
    if (!activeBook || !confirmAction) return;
    if (previewState) {
      setConfirmAction(null);
      return;
    }
    setConfirmBusy(true);
    try {
      if (confirmAction === "reset") {
        const { book, chapters: chList } = await api.resetTranslations(activeBook.id);
        setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
        setChapters(chList);
        if (activeChapterId) {
          await loadChapterDocument(activeBook.id, activeChapterId);
        }
        showToast("已重置全书译文进度");
      } else {
        await api.deleteBook(activeBook.id);
        const remaining = books.filter((b) => b.id !== activeBook.id);
        setBooks(remaining);
        setActiveBookId(remaining[0]?.id ?? null);
        if (remaining.length === 0) {
          setChapters([]);
          setChapterNodes([]);
          setPlaceholderNodes({});
          setSegments([]);
          setGlossary([]);
        }
        showToast(`已删除《${activeBook.title}》`);
      }
      setConfirmAction(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "操作失败");
    } finally {
      setConfirmBusy(false);
    }
  }

  const handleLocateSegment = useCallback((domPath: string) => {
    setSegmentFilter("all");
    setHighlightedDomPath(domPath);
    window.setTimeout(() => {
      setHighlightedDomPath((curr) => (curr === domPath ? null : curr));
    }, 1800);
  }, []);

  const handleNavigateChapter = useCallback(
    (chapterHref: string, hash?: string) => {
      const target = chapters.find((c) => c.href === chapterHref);
      if (!target) {
        showToast("未在目录中找到对应章节");
        return;
      }
      setSegmentFilter("all");
      if (target.id !== activeChapterId) {
        setActiveChapterId(target.id);
      }
      if (hash) {
        setPendingAnchorHash(hash);
      }
    },
    [activeChapterId, chapters, showToast],
  );

  const handleClearPendingAnchor = useCallback(() => {
    setPendingAnchorHash(null);
  }, []);

  return (
    <>
      <WorkbenchShell
        hasBook={Boolean(activeBook)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebar={
          activeBook ? (
            <Sidebar
              books={books}
              activeBookId={activeBookId}
              chapters={chapters}
              activeChapterId={activeChapterId}
              activeProvider={activeProvider}
              theme={theme}
              uploading={uploading}
              mobileOpen={mobileSidebarOpen}
              onToggleTheme={toggleTheme}
              onSelectBook={(id) => {
                setActiveBookId(id);
                setSegmentFilter("all");
              }}
              onSelectChapter={(id) => {
                setActiveChapterId(id);
                setSegmentFilter("all");
              }}
              onUploadFile={(f) => void handleUploadFile(f)}
              onOpenSettings={() => setSettingsOpen(true)}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          ) : undefined
        }
        topBar={
          activeBook ? (
            <TopActionBar
              book={activeBook}
              glossaryCount={glossary.length}
              prescanBanner={prescanBanner}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              onStartOrResume={() => void handleStartOrResume(false)}
              onPause={() => void handlePause()}
              onRetryFailed={() => void handleStartOrResume(true)}
              onChangeOutputMode={(m) => void handleChangeOutputMode(m)}
              onOpenGlossary={() => setGlossaryOpen(true)}
              onOpenExport={() => setExportOpen(true)}
            />
          ) : undefined
        }
      >
        {!activeBook ? (
          <BookImportEmpty
            activeProvider={activeProvider}
            uploading={uploading}
            errorMessage={errorMessage}
            onUploadFile={(f) => void handleUploadFile(f)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <ChapterReader
            book={activeBook}
            chapter={activeChapter}
            nodes={chapterNodes}
            segments={segments}
            placeholderNodes={placeholderNodes}
            docFallback={docFallback}
            filter={segmentFilter}
            loading={loadingReader}
            errorMessage={errorMessage}
            outputMode={activeBook.outputMode}
            highlightedDomPath={highlightedDomPath}
            pendingAnchorHash={pendingAnchorHash}
            onClearPendingAnchor={handleClearPendingAnchor}
            onChangeFilter={setSegmentFilter}
            onLocateSegment={handleLocateSegment}
            onNavigateChapter={handleNavigateChapter}
            onRetryLoad={() => {
              if (activeBookId && activeChapterId) {
                void loadChapterDocument(activeBookId, activeChapterId);
              } else {
                void loadBootstrap();
              }
            }}
            onSaveSegment={handleSaveSegment}
            onRetranslateSegment={handleRetranslateSegment}
            onRequestResetBook={() => setConfirmAction("reset")}
            onRequestDeleteBook={() => setConfirmAction("delete")}
          />
        )}
      </WorkbenchShell>

      {activeBook && (
        <>
          <GlossaryDrawer
            open={glossaryOpen}
            book={activeBook}
            chapters={chapters}
            terms={glossary}
            prescanBanner={prescanBanner}
            onClose={() => setGlossaryOpen(false)}
            onTogglePrescanEnabled={handleTogglePrescanEnabled}
            onStartPrescan={handleStartPrescan}
            onStopPrescan={handleStopPrescan}
            onAddTerm={handleAddTerm}
            onDeleteTerm={handleDeleteTerm}
          />

          <ExportPopover
            open={exportOpen}
            book={activeBook}
            onClose={() => setExportOpen(false)}
            onExport={(mode) => {
              if (previewState) {
                showToast(`已生成 ${mode === "bilingual" ? "双语" : "纯译文"} EPUB（预览模式）`);
                return;
              }
              window.location.href = api.getExportUrl(activeBook.id, mode);
            }}
          />

          <ConfirmDialog
            open={confirmAction !== null}
            title={
              confirmAction === "delete"
                ? `删除《${activeBook.title}》及其本地译文？`
                : `重置《${activeBook.title}》的全部译文进度？`
            }
            description={
              confirmAction === "delete"
                ? "此操作将永久删除本地数据库记录与 data/ 下的书籍副本，无法撤销。"
                : "所有章节段落将恢复为待翻译状态（术语表与原书文件会保留）。"
            }
            confirmLabel={confirmAction === "delete" ? "确认删除" : "确认重置"}
            busy={confirmBusy}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => void handleConfirmAction()}
          />
        </>
      )}

      <ProviderSettingsModal
        open={settingsOpen}
        providers={providers}
        onClose={() => setSettingsOpen(false)}
        onSaveProvider={handleSaveProvider}
        onDeleteProvider={handleDeleteProvider}
        onTestProvider={handleTestProvider}
      />

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            right: "20px",
            bottom: "20px",
            zIndex: "var(--z-toast)",
            backgroundColor: "var(--text)",
            color: "var(--surface-raised)",
            padding: "10px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-sm)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
