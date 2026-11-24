import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Settings,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import type { ProviderPresetPublic } from "../../core/types.js";

interface ProviderSettingsModalProps {
  open: boolean;
  providers: ProviderPresetPublic[];
  onClose: () => void;
  onSaveProvider: (input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    concurrency: number;
    maxBatchChars: number;
    temperature: number;
    isActive: boolean;
  }) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  onTestProvider: (input: {
    id?: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
  }) => Promise<{ ok: boolean; latencyMs: number; model: string; message: string }>;
}

export function ProviderSettingsModal({
  open,
  providers,
  onClose,
  onSaveProvider,
  onDeleteProvider,
  onTestProvider,
}: ProviderSettingsModalProps) {
  const [selectedId, setSelectedId] = useState<string>("new");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [concurrency, setConcurrency] = useState(4);
  const [maxBatchChars, setMaxBatchChars] = useState(2600);
  const [temperature, setTemperature] = useState(0.3);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  const selectedPreset = providers.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const active = providers.find((p) => p.isActive) ?? providers[0];
    if (active) {
      loadPresetIntoForm(active);
    } else {
      startNewPreset();
    }
  }, [open, providers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function loadPresetIntoForm(p: ProviderPresetPublic) {
    setSelectedId(p.id);
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setApiKey("");
    setModel(p.model);
    setConcurrency(p.concurrency);
    setMaxBatchChars(p.maxBatchChars);
    setTemperature(p.temperature);
    setFormError(null);
    setTestResult(null);
  }

  function startNewPreset() {
    setSelectedId("new");
    setName("自定义 OpenAI 兼容服务");
    setBaseUrl("https://api.openai.com/v1");
    setApiKey("");
    setModel("gpt-4o-mini");
    setConcurrency(4);
    setMaxBatchChars(2600);
    setTemperature(0.3);
    setFormError(null);
    setTestResult(null);
  }

  if (!open) return null;

  async function handleTest() {
    if (!baseUrl.trim() || !model.trim()) {
      setFormError("请先填写 Base URL 和模型名称");
      return;
    }
    setTesting(true);
    setFormError(null);
    setTestResult(null);
    try {
      const res = await onTestProvider({
        id: selectedPreset?.id,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
      });
      setTestResult({ ok: res.ok, latencyMs: res.latencyMs, message: res.message });
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : "连通性测试失败",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      setFormError("名称、Base URL 与模型名称均为必填项");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSaveProvider({
        id: selectedPreset?.id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        concurrency,
        maxBatchChars,
        temperature,
        isActive: true,
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-lg"
        role="dialog"
        aria-modal="true"
        aria-label="API 与模型配置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="overlay-header">
          <div className="overlay-title-group">
            <Settings size={18} aria-hidden="true" />
            <h2 className="overlay-title">OpenAI 兼容模型设置</h2>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm icon-btn"
            onClick={onClose}
            aria-label="关闭设置弹窗"
          >
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="preset-strip" role="tablist" aria-label="模型预设列表">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selectedId === p.id}
                className={`preset-pill ${selectedId === p.id ? "is-selected" : ""}`}
                onClick={() => loadPresetIntoForm(p)}
              >
                <span>{p.name}</span>
                {p.isActive && <span className="preset-active-dot" title="当前生效" />}
              </button>
            ))}
            <button
              type="button"
              className={`preset-pill is-add ${selectedId === "new" ? "is-selected" : ""}`}
              onClick={startNewPreset}
            >
              <Plus size={13} aria-hidden="true" />
              <span>新增预设</span>
            </button>
          </div>

          <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="prov-name" className="field-label">
                  预设名称
                </label>
                <input
                  id="prov-name"
                  type="text"
                  className="field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="prov-model" className="field-label">
                  模型名称（Model）
                </label>
                <input
                  id="prov-model"
                  type="text"
                  className="field-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini / deepseek-chat / qwen2.5:14b"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="prov-base-url" className="field-label">
                API Base URL
              </label>
              <input
                id="prov-base-url"
                type="url"
                className="field-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                required
              />
              <span className="field-help">
                服务仅监听本机 127.0.0.1，密钥保存在本地 SQLite（data/app.db，已列入 .gitignore）。
              </span>
            </div>

            <div className="field">
              <label htmlFor="prov-api-key" className="field-label">
                API Key
              </label>
              <input
                id="prov-api-key"
                type="password"
                className="field-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  selectedPreset?.hasApiKey
                    ? `已保存（${selectedPreset.apiKeyMasked}），留空则保持不变`
                    : "输入 sk-...（本地 Ollama 可留空或填 ollama）"
                }
                autoComplete="off"
              />
            </div>

            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="prov-concurrency" className="field-label">
                  并发数（1–10）
                </label>
                <input
                  id="prov-concurrency"
                  type="number"
                  min={1}
                  max={10}
                  className="field-input tabular-nums"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value) || 4)}
                />
              </div>
              <div className="field">
                <label htmlFor="prov-batch" className="field-label">
                  单块字符预算
                </label>
                <input
                  id="prov-batch"
                  type="number"
                  min={600}
                  max={10000}
                  step={200}
                  className="field-input tabular-nums"
                  value={maxBatchChars}
                  onChange={(e) => setMaxBatchChars(Number(e.target.value) || 2600)}
                />
              </div>
              <div className="field">
                <label htmlFor="prov-temp" className="field-label">
                  Temperature
                </label>
                <input
                  id="prov-temp"
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.1}
                  className="field-input tabular-nums"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`test-result-banner ${testResult.ok ? "is-ok" : "is-fail"}`}
                role="status"
              >
                {testResult.ok ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : (
                  <AlertCircle size={16} aria-hidden="true" />
                )}
                <span>
                  {testResult.message}
                  {testResult.latencyMs > 0 ? ` · ${testResult.latencyMs}ms` : ""}
                </span>
              </div>
            )}

            {formError && (
              <p className="field-error" role="alert">
                {formError}
              </p>
            )}

            <footer className="modal-footer">
              <div className="modal-footer-left">
                {selectedPreset && providers.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    onClick={() => void onDeleteProvider(selectedPreset.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span>删除预设</span>
                  </button>
                )}
              </div>

              <div className="modal-footer-right">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={testing}
                  onClick={() => void handleTest()}
                >
                  {testing ? (
                    <Loader2 size={14} className="spin" aria-hidden="true" />
                  ) : (
                    <Wifi size={14} aria-hidden="true" />
                  )}
                  <span>{testing ? "测试中…" : "测试连通性"}</span>
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <span>{saving ? "保存中…" : "保存并启用"}</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
