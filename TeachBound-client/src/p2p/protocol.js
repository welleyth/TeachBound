/**
 * TeachBound P2P message protocol (v1).
 *
 * We keep the envelope intentionally small and JSON-based for early iteration.
 * Later we can migrate to a binary codec if needed.
 */

export const P2P_PROTOCOL_VERSION = 1;

export const P2P_EVENT_TYPES = Object.freeze({
  ELEMENT_UPSERT: 'element_upsert',
  ELEMENT_DELETE: 'element_delete',
  CANVAS_CLEAR: 'canvas_clear',
  SNAPSHOT_REQUEST: 'snapshot_request',
  SNAPSHOT_RESPONSE: 'snapshot_response',
  DEBUG_HELLO: 'debug_hello',
});

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

export function generateMessageId() {
  // crypto.randomUUID is widely supported in modern browsers and Node.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: best-effort uniqueness for local dev.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createEnvelope({ room, type, payload, from }) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new Error('P2P envelope requires a non-empty string "type"');
  }

  return {
    v: P2P_PROTOCOL_VERSION,
    id: generateMessageId(),
    room: room ?? null,
    type,
    ts: Date.now(),
    from: from ?? null,
    payload: payload ?? null,
  };
}

export function encodeEnvelope(envelope) {
  return _encoder.encode(JSON.stringify(envelope));
}

export function decodeEnvelope(data) {
  const text = typeof data === 'string' ? data : _decoder.decode(data);
  const obj = JSON.parse(text);

  // Minimal validation - keep it permissive to avoid bricking peers during iteration.
  if (!obj || typeof obj !== 'object') throw new Error('Invalid envelope: not an object');
  if (obj.v !== P2P_PROTOCOL_VERSION) throw new Error(`Unsupported envelope version: ${obj.v}`);
  if (typeof obj.id !== 'string' || obj.id.length === 0)
    throw new Error('Invalid envelope: missing id');
  if (typeof obj.type !== 'string' || obj.type.length === 0)
    throw new Error('Invalid envelope: missing type');
  if (typeof obj.ts !== 'number') throw new Error('Invalid envelope: missing ts');

  return obj;
}

export function createDedupeCache({ ttlMs = 5 * 60 * 1000, maxSize = 5000 } = {}) {
  const seen = new Map(); // id -> insertedAt

  const prune = (now = Date.now()) => {
    const cutoff = now - ttlMs;
    for (const [id, insertedAt] of seen) {
      if (insertedAt >= cutoff) break;
      seen.delete(id);
    }
    while (seen.size > maxSize) {
      const oldest = seen.keys().next().value;
      if (oldest == null) break;
      seen.delete(oldest);
    }
  };

  return {
    has(id) {
      prune();
      return seen.has(id);
    },
    add(id) {
      const now = Date.now();
      seen.set(id, now);
      prune(now);
    },
    clear() {
      seen.clear();
    },
  };
}
