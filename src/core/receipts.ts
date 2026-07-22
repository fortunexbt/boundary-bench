import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical.js";
import type { TraceEvent, TraceEventSeed } from "./types.js";

const GENESIS_HASH = "0".repeat(64);

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function eventProjection(
  event: Omit<TraceEvent, "hash">,
): Record<string, unknown> {
  return {
    actor: event.actor,
    audience: event.audience,
    costMicros: event.costMicros,
    id: event.id,
    kind: event.kind,
    meta: event.meta,
    payloadDigest: event.payloadDigest,
    previousHash: event.previousHash,
    sequence: event.sequence,
    tags: event.tags,
    tick: event.tick,
    tool: event.tool,
    trust: event.trust,
  };
}

export function materializeTrace(seeds: TraceEventSeed[]): TraceEvent[] {
  let previousHash: string | null = null;

  return seeds.map((seed, sequence) => {
    const eventWithoutHash: Omit<TraceEvent, "hash"> = {
      actor: seed.actor,
      audience: seed.audience,
      costMicros: seed.costMicros,
      id: seed.id,
      kind: seed.kind,
      meta: seed.meta,
      payloadDigest: sha256(seed.payloadLabel),
      previousHash,
      sequence,
      tags: [...(seed.tags ?? [])].sort(),
      tick: seed.tick,
      tool: seed.tool,
      trust: seed.trust,
    };
    const hash = sha256(
      `${previousHash ?? GENESIS_HASH}:${canonicalJson(eventProjection(eventWithoutHash))}`,
    );
    previousHash = hash;
    return { ...eventWithoutHash, hash };
  });
}

export function traceRoot(trace: TraceEvent[]): string {
  return trace.at(-1)?.hash ?? sha256("boundary-bench:empty-trace");
}

export function verifyReceiptChain(trace: TraceEvent[]): boolean {
  let previousHash: string | null = null;

  for (const [sequence, event] of trace.entries()) {
    if (event.sequence !== sequence || event.previousHash !== previousHash)
      return false;

    const { hash: _hash, ...eventWithoutHash } = event;
    const expectedHash = sha256(
      `${previousHash ?? GENESIS_HASH}:${canonicalJson(eventProjection(eventWithoutHash))}`,
    );
    if (event.hash !== expectedHash) return false;
    previousHash = event.hash;
  }

  return true;
}

const RAW_BODY_KEYS = new Set([
  "body",
  "content",
  "prompt",
  "raw",
  "secret",
  "token",
]);

export function containsRawBody(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsRawBody(item));
  if (value === null || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(
    ([key, entryValue]) =>
      RAW_BODY_KEYS.has(key.toLowerCase()) || containsRawBody(entryValue),
  );
}
