export { parseEpubBuffer, resolveZipPath, relativePosixPath, dirnamePosix } from "./container.js";
export {
  extractChapterSegments,
  validateTranslatedPlaceholders,
  restoreTemplateToXhtml,
  templateToPlainText,
  applyTranslationsToChapterXhtml,
  escapeXmlText,
  type ChapterSegmentTranslation,
  type PlaceholderValidationResult,
} from "./xhtml.js";
export { exportTranslatedEpub, type ExportEpubOptions, type ExportChapterInput } from "./exporter.js";
