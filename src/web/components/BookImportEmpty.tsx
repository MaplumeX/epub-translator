import { useRef, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Settings, Upload } from "lucide-react";
import type { ProviderPresetPublic } from "../../core/types.js";

interface BookImportEmptyProps {
  activeProvider: ProviderPresetPublic | null;
  uploading: boolean;
  errorMessage: string | null;
  onUploadFile: (file: File) => void;
  onOpenSettings: () => void;
}

export function BookImportEmpty({
  activeProvider,
  uploading,
  errorMessage,
  onUploadFile,
  onOpenSettings,
}: BookImportEmptyProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isLocal = Boolean(activeProvider && /localhost|127\.0\.0\.1/.test(activeProvider.baseUrl));
  const apiReady = Boolean(activeProvider && (activeProvider.hasApiKey || isLocal));

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      onUploadFile(file);
    }
  }

  return (
    <section className="empty-stage" aria-label="导入 EPUB">
      <div className="empty-stage-inner">
        <div
          className={`api-readiness-banner ${apiReady ? "is-ready" : "is-warn"}`}
          role="status"
        >
          <div className="api-readiness-copy">
            {apiReady ? (
              <CheckCircle2 size={16} strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} strokeWidth={1.9} aria-hidden="true" />
            )}
            <span>
              {apiReady
                ? `翻译引擎已就绪 · ${activeProvider?.name}（${activeProvider?.model}）`
                : "尚未配置可用的 API Key，导入后需在设置中填写密钥方可翻译"}
            </span>
          </div>
          <button type="button" className="btn btn-tertiary btn-sm" onClick={onOpenSettings}>
            <Settings size={14} aria-hidden="true" />
            <span>{apiReady ? "切换模型" : "前往配置"}</span>
          </button>
        </div>

        <div
          className={`dropzone-card ${dragOver ? "is-drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="dropzone-mark" aria-hidden="true">
            <BookOpen size={28} strokeWidth={1.6} />
          </div>
          <h1 className="dropzone-title">导入一本 EPUB 开始翻译</h1>
          <p className="dropzone-desc">
            拖入 <code>.epub</code> 文件或点击选择。原书将只读保存在本地 <code>data/</code>{" "}
            目录，支持双语对照与纯译文无损导出。
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} strokeWidth={2} aria-hidden="true" />
            <span>{uploading ? "正在解析 EPUB…" : "选择 .epub 文件"}</span>
          </button>

          {errorMessage && (
            <p className="dropzone-error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
