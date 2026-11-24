export { parseEpubBuffer, resolveZipPath, relativePosixPath, dirnamePosix } from "./container.js";
export {
  extractChapterSegments,
  validateTranslatedPlaceholders,
  restoreTemplateToXhtml,
  templateToPlainText,
  applyTranslationsToChapterXhtml,
  escapeXmlText,
  selectTranslatableBlocks,
  type ChapterSegmentTranslation,
  type PlaceholderValidationResult,
} from "./xhtml.js";
export {
  buildChapterDocument,
  buildFallbackChapterNodes,
  classifyChapterLink,
  sanitizeInlineHtmlFragment,
  type BuildChapterDocumentOptions,
  type BuiltChapterDocument,
} from "./document.js";
export { exportTranslatedEpub, type ExportEpubOptions, type ExportChapterInput } from "./exporter.js";
