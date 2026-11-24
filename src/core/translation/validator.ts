import { z } from "zod";
import { validateTranslatedPlaceholders } from "../epub/xhtml.js";
import type { InlinePlaceholder } from "../types.js";

// Tolerant fence extraction paired with strict Zod + placeholder checks survives provider formatting quirks
// while guaranteeing corrupted tags trigger single-segment fallback instead of broken XHTML.
// See ADR 2026-11-24-epub-translator-architecture.

const BatchItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});

const BatchEnvelopeSchema = z.union([
  z.object({ translations: z.array(BatchItemSchema) }),
  z.array(BatchItemSchema),
]);

const PrescanResponseSchema = z.object({
  summary: z.string().default(""),
  terms: z
    .array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        note: z.string().optional().default(""),
      }),
    )
    .default([]),
});

const MetadataTocSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  chapters: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .default([]),
});

export function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    const firstBracket = candidate.indexOf("[");
    const lastBracket = candidate.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(candidate.slice(firstBracket, lastBracket + 1));
    }
    throw new Error("无法从模型回复中解析合法 JSON");
  }
}

export interface ExpectedSegmentSpec {
  id: string;
  placeholders: InlinePlaceholder[];
}

export interface BatchValidationResult {
  valid: Map<string, string>;
  invalid: Map<string, string>;
}

export function parseAndValidateBatchResponse(
  raw: string,
  expected: ExpectedSegmentSpec[],
): BatchValidationResult {
  const valid = new Map<string, string>();
  const invalid = new Map<string, string>();

  let parsedJson: unknown;
  try {
    parsedJson = extractJsonPayload(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "JSON 解析失败";
    for (const seg of expected) {
      invalid.set(seg.id, reason);
    }
    return { valid, invalid };
  }

  const envelope = BatchEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    for (const seg of expected) {
      invalid.set(seg.id, "模型输出结构不符合 translations 数组格式");
    }
    return { valid, invalid };
  }

  const items = Array.isArray(envelope.data) ? envelope.data : envelope.data.translations;
  const byId = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const item of items) {
    if (byId.has(item.id)) {
      duplicateIds.add(item.id);
    }
    byId.set(item.id, item.text.trim());
  }

  for (const seg of expected) {
    if (duplicateIds.has(seg.id)) {
      invalid.set(seg.id, `模型重复返回了段落 ${seg.id}`);
      continue;
    }
    const text = byId.get(seg.id);
    if (!text) {
      invalid.set(seg.id, `模型漏译或返回空译文（${seg.id}）`);
      continue;
    }
    const check = validateTranslatedPlaceholders(text, seg.placeholders);
    if (!check.valid) {
      invalid.set(seg.id, check.reason ?? "占位符校验未通过");
      continue;
    }
    valid.set(seg.id, text);
  }

  return { valid, invalid };
}

export interface ParsedPrescanResult {
  summary: string;
  terms: Array<{ source: string; target: string; note: string }>;
}

export function parsePrescanResponse(raw: string): ParsedPrescanResult {
  const parsed = extractJsonPayload(raw);
  const result = PrescanResponseSchema.parse(parsed);
  return {
    summary: result.summary.trim(),
    terms: result.terms
      .map((t) => ({
        source: t.source.trim(),
        target: t.target.trim(),
        note: (t.note ?? "").trim(),
      }))
      .filter((t) => t.source.length > 0 && t.target.length > 0),
  };
}

export function parseMetadataTocResponse(raw: string) {
  const parsed = extractJsonPayload(raw);
  return MetadataTocSchema.parse(parsed);
}
