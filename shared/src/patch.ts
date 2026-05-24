/**
 * Patch types, schemas, and the `applyPatches` pure function.
 *
 * Patches are described using RFC 6901 JSON Pointer paths relative to an
 * entity's data object. The `add` operation creates intermediate objects;
 * `remove` is a no-op when the path does not exist.
 */

import { z } from 'zod';
import { entityTypeSchema } from './enums';
import type { CampaignState } from './stubs';

// ============================================================================
// Types and schemas
// ============================================================================

export const patchOpSchema = z.enum(['add', 'remove']);
export type PatchOp = z.infer<typeof patchOpSchema>;

export const patchSchema = z.object({
  target: z.object({
    type: entityTypeSchema,
    id: z.string(),
  }),
  /** RFC 6901 JSON Pointer relative to the entity's data root (e.g. '/hp/current'). */
  path: z.string(),
  op: patchOpSchema,
  /** Required for 'add'; ignored for 'remove'. */
  value: z.unknown().optional(),
});
export type Patch = z.infer<typeof patchSchema>;

// ============================================================================
// Error type
// ============================================================================

/**
 * Thrown when a patch cannot be applied due to a structural problem such as
 * an invalid JSON Pointer.
 *
 * Missing paths and missing entities are *not* errors — they produce no-ops
 * for `remove` and entity-creation for `add`.
 */
export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

// ============================================================================
// JSON Pointer helpers (RFC 6901)
// ============================================================================

/**
 * Parse an RFC 6901 JSON Pointer into its unescaped path segments.
 *
 * @param pointer - Must start with '/'.
 * @throws PatchError for syntactically invalid pointers.
 */
function parsePointer(pointer: string): string[] {
  if (!pointer.startsWith('/')) {
    throw new PatchError(
      `Invalid JSON Pointer: must start with '/' (got: '${pointer}')`,
    );
  }
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Immutably set a value at the given path segments within an object/array tree.
 *
 * - Creates intermediate objects for any missing path segments.
 * - '-' as the final segment appends to an array.
 * - Numeric segments navigate into or extend arrays.
 */
function setIn(node: unknown, segments: string[], value: unknown): unknown {
  if (segments.length === 0) return value;

  const [head, ...tail] = segments;

  if (Array.isArray(node)) {
    const copy = [...node];
    if (head === '-') {
      if (tail.length > 0) {
        throw new PatchError("Cannot navigate past '-' in a JSON Pointer");
      }
      copy.push(value);
      return copy;
    }
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new PatchError(`Invalid array index in JSON Pointer: '${head}'`);
    }
    copy[idx] = tail.length === 0 ? value : setIn(copy[idx] ?? {}, tail, value);
    return copy;
  }

  if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>;
    return {
      ...o,
      [head]: tail.length === 0 ? value : setIn(o[head] ?? {}, tail, value),
    };
  }

  // Primitive node — create an object to hold the new value
  return { [head]: tail.length === 0 ? value : setIn({}, tail, value) };
}

/**
 * Immutably remove a value at the given path segments within an object/array
 * tree. Missing paths and out-of-range array indices are no-ops.
 */
function removeIn(node: unknown, segments: string[]): unknown {
  if (segments.length === 0) return node;

  const [head, ...tail] = segments;

  if (Array.isArray(node)) {
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) {
      return node; // no-op
    }
    if (tail.length === 0) {
      return [...node.slice(0, idx), ...node.slice(idx + 1)];
    }
    return node.map((item, i) => (i === idx ? removeIn(item, tail) : item));
  }

  if (typeof node === 'object' && node !== null) {
    const o = node as Record<string, unknown>;
    if (!(head in o)) return o; // no-op
    if (tail.length === 0) {
      return Object.fromEntries(Object.entries(o).filter(([k]) => k !== head));
    }
    return { ...o, [head]: removeIn(o[head], tail) };
  }

  return node; // primitive — no-op
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply a sequence of patches to a CampaignState immutably.
 *
 * Each patch targets an entity by `target.id` and a JSON Pointer `path`
 * within that entity's data. Patches are applied in order; earlier patches
 * are visible to later ones within the same call.
 *
 * @param state   - Current campaign state (not mutated).
 * @param patches - Ordered list of patches to apply.
 * @returns New state with all patches applied.
 * @throws PatchError if any patch contains an invalid JSON Pointer.
 */
export function applyPatches(
  state: CampaignState,
  patches: Patch[],
): CampaignState {
  if (patches.length === 0) return state;

  let entities = state.entities;

  for (const patch of patches) {
    const segments = parsePointer(patch.path);
    const entity = entities[patch.target.id] ?? {};

    const updated =
      patch.op === 'add'
        ? (setIn(entity, segments, patch.value) as Record<string, unknown>)
        : (removeIn(entity, segments) as Record<string, unknown>);

    entities = { ...entities, [patch.target.id]: updated };
  }

  return { ...state, entities };
}
