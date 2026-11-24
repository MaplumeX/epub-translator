export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface ConnectivityCheckResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  message: string;
}

export interface TranslationProvider {
  readonly model: string;
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  testConnection(signal?: AbortSignal): Promise<ConnectivityCheckResult>;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function normalizeCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function parseRetryAfterMs(headerVal: string | null): number | null {
  if (!headerVal) return null;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.min(dateMs - Date.now(), 60_000));
  }
  return null;
}

async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class ProviderHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.retryable = retryable;
  }
}

export class OpenAICompatibleProvider implements TranslationProvider {
  readonly model: string;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly defaultTemperature: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    this.url = normalizeCompletionsUrl(config.baseUrl);
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.defaultTemperature = config.temperature ?? 0.3;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 600;
    this.timeoutMs = config.timeoutMs ?? 90_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      if (request.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const controller = new AbortController();
      const onParentAbort = () => controller.abort();
      request.signal?.addEventListener("abort", onParentAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (this.apiKey.trim()) {
          headers.Authorization = `Bearer ${this.apiKey.trim()}`;
        }

        const body: Record<string, unknown> = {
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? this.defaultTemperature,
        };
        if (request.maxTokens !== undefined) {
          body.max_tokens = request.maxTokens;
        }
        if (request.jsonMode) {
          body.response_format = { type: "json_object" };
        }

        const response = await this.fetchImpl(this.url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", onParentAbort);

        if (!response.ok) {
          const errText = (await response.text().catch(() => "")).slice(0, 400);
          const retryable = response.status === 429 || response.status >= 500;
          const err = new ProviderHttpError(
            response.status,
            `HTTP ${response.status}: ${errText || response.statusText}`,
            retryable,
          );

          if (retryable && attempt < this.maxRetries) {
            const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
            const delay = retryAfter ?? this.baseDelayMs * Math.pow(2, attempt);
            attempt += 1;
            await sleepWithSignal(delay, request.signal);
            continue;
          }
          throw err;
        }

        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("模型返回空内容");
        }

        return {
          content,
          usage: json.usage
            ? {
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
              }
            : undefined,
        };
      } catch (err) {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", onParentAbort);
        lastError = err;

        if (request.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (err instanceof ProviderHttpError && !err.retryable) {
          throw err;
        }
        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt);
          attempt += 1;
          await sleepWithSignal(delay, request.signal);
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("LLM 请求失败");
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectivityCheckResult> {
    const started = Date.now();
    try {
      const res = await this.chatCompletion({
        messages: [
          { role: "system", content: "Reply with OK." },
          { role: "user", content: "Ping" },
        ],
        maxTokens: 16,
        temperature: 0,
        signal,
      });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        model: this.model,
        message: `连接成功（${res.content.trim().slice(0, 32)}）`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        model: this.model,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
