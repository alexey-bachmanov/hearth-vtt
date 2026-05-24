import { describe, it, expect } from 'vitest';
import { applyPatches, PatchError, type Patch } from './patch';
import type { CampaignState } from './stubs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  entities: Record<string, Record<string, unknown>> = {},
): CampaignState {
  return { entities };
}

function p(
  id: string,
  path: string,
  op: 'add' | 'remove',
  value?: unknown,
): Patch {
  return { target: { type: 'actor', id }, path, op, value };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyPatches', () => {
  // ── empty patches ─────────────────────────────────────────────────────────

  it('returns the same state reference when patches is empty', () => {
    const state = makeState({ 'actor-1': { hp: 10 } });
    expect(applyPatches(state, [])).toBe(state);
  });

  // ── add operation ─────────────────────────────────────────────────────────

  it('adds a primitive field to an existing entity', () => {
    const state = makeState({ 'actor-1': { name: 'Gandalf' } });
    const result = applyPatches(state, [p('actor-1', '/hp', 'add', 20)]);
    expect(result.entities['actor-1']).toEqual({ name: 'Gandalf', hp: 20 });
  });

  it('adds a nested field, creating intermediate objects', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [
      p('actor-1', '/resources/hp/current', 'add', 14),
    ]);
    expect(result.entities['actor-1']).toEqual({
      resources: { hp: { current: 14 } },
    });
  });

  it('overwrites an existing field when op is add', () => {
    const state = makeState({ 'actor-1': { hp: 10 } });
    const result = applyPatches(state, [p('actor-1', '/hp', 'add', 99)]);
    expect(result.entities['actor-1']!['hp']).toBe(99);
  });

  it('creates deeply nested intermediate objects', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [
      p('actor-1', '/a/b/c/d', 'add', 'deep'),
    ]);
    expect(
      (result.entities['actor-1']!['a'] as Record<string, unknown>)['b'],
    ).toEqual({ c: { d: 'deep' } });
  });

  it('creates entity if it does not exist', () => {
    const state = makeState({});
    const result = applyPatches(state, [
      p('actor-new', '/name', 'add', 'Frodo'),
    ]);
    expect(result.entities['actor-new']).toEqual({ name: 'Frodo' });
  });

  it('adds a null value', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [p('actor-1', '/effect', 'add', null)]);
    expect(result.entities['actor-1']!['effect']).toBeNull();
  });

  it('adds a value into an array at a specific index', () => {
    const state = makeState({ 'actor-1': { tags: ['a', 'b', 'c'] } });
    const result = applyPatches(state, [p('actor-1', '/tags/1', 'add', 'x')]);
    expect(result.entities['actor-1']!['tags']).toEqual(['a', 'x', 'c']);
  });

  it("appends to an array using the '-' sentinel", () => {
    const state = makeState({ 'actor-1': { items: ['sword'] } });
    const result = applyPatches(state, [
      p('actor-1', '/items/-', 'add', 'shield'),
    ]);
    expect(result.entities['actor-1']!['items']).toEqual(['sword', 'shield']);
  });

  // ── remove operation ──────────────────────────────────────────────────────

  it('removes a leaf field from an existing entity', () => {
    const state = makeState({ 'actor-1': { hp: 10, name: 'Bilbo' } });
    const result = applyPatches(state, [p('actor-1', '/hp', 'remove')]);
    expect(result.entities['actor-1']).toEqual({ name: 'Bilbo' });
  });

  it('is a no-op when removing a non-existent field', () => {
    const state = makeState({ 'actor-1': { name: 'Bilbo' } });
    const result = applyPatches(state, [p('actor-1', '/hp', 'remove')]);
    expect(result.entities['actor-1']).toEqual({ name: 'Bilbo' });
  });

  it('is a no-op when removing from a non-existent entity', () => {
    const state = makeState({});
    const result = applyPatches(state, [p('ghost', '/hp', 'remove')]);
    expect(result.entities['ghost']).toEqual({});
  });

  it('removes an array element by index', () => {
    const state = makeState({
      'actor-1': { items: ['sword', 'shield', 'bow'] },
    });
    const result = applyPatches(state, [p('actor-1', '/items/1', 'remove')]);
    expect(result.entities['actor-1']!['items']).toEqual(['sword', 'bow']);
  });

  it('removes the last element from an array', () => {
    const state = makeState({ 'actor-1': { items: ['sword'] } });
    const result = applyPatches(state, [p('actor-1', '/items/0', 'remove')]);
    expect(result.entities['actor-1']!['items']).toEqual([]);
  });

  it('is a no-op for an out-of-range array index', () => {
    const state = makeState({ 'actor-1': { items: ['sword'] } });
    const result = applyPatches(state, [p('actor-1', '/items/99', 'remove')]);
    expect(result.entities['actor-1']!['items']).toEqual(['sword']);
  });

  // ── immutability ──────────────────────────────────────────────────────────

  it('does not mutate the original state on add', () => {
    const original = makeState({ 'actor-1': { hp: 10 } });
    applyPatches(original, [p('actor-1', '/hp', 'add', 99)]);
    expect(original.entities['actor-1']!['hp']).toBe(10);
  });

  it('does not mutate the original state on remove', () => {
    const original = makeState({ 'actor-1': { hp: 10, name: 'Bilbo' } });
    applyPatches(original, [p('actor-1', '/hp', 'remove')]);
    expect(original.entities['actor-1']).toEqual({ hp: 10, name: 'Bilbo' });
  });

  it('does not mutate nested objects on add', () => {
    const nested = { hp: { current: 10, max: 20 } };
    const original = makeState({ 'actor-1': nested });
    applyPatches(original, [p('actor-1', '/hp/current', 'add', 5)]);
    expect(nested.hp.current).toBe(10);
  });

  // ── batch operations ──────────────────────────────────────────────────────

  it('applies batch patches in order so later patches see earlier results', () => {
    const state = makeState({ 'actor-1': { hp: 0 } });
    const result = applyPatches(state, [
      p('actor-1', '/hp', 'add', 10),
      p('actor-1', '/hp', 'add', 20),
    ]);
    expect(result.entities['actor-1']!['hp']).toBe(20);
  });

  it('applies multiple patches to the same entity in one batch', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [
      p('actor-1', '/name', 'add', 'Aragorn'),
      p('actor-1', '/hp', 'add', 30),
      p('actor-1', '/level', 'add', 5),
    ]);
    expect(result.entities['actor-1']).toEqual({
      name: 'Aragorn',
      hp: 30,
      level: 5,
    });
  });

  it('applies patches to different entities in one batch', () => {
    const state = makeState({ 'actor-1': { hp: 10 }, 'actor-2': { hp: 5 } });
    const result = applyPatches(state, [
      p('actor-1', '/hp', 'add', 0),
      p('actor-2', '/hp', 'add', 0),
    ]);
    expect(result.entities['actor-1']!['hp']).toBe(0);
    expect(result.entities['actor-2']!['hp']).toBe(0);
  });

  // ── RFC 6901 escaping ─────────────────────────────────────────────────────

  it('unescapes ~0 to ~ in path segments', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [p('actor-1', '/my~0key', 'add', 1)]);
    expect(result.entities['actor-1']!['my~key']).toBe(1);
  });

  it('unescapes ~1 to / in path segments', () => {
    const state = makeState({ 'actor-1': {} });
    const result = applyPatches(state, [p('actor-1', '/my~1key', 'add', 2)]);
    expect(result.entities['actor-1']!['my/key']).toBe(2);
  });

  // ── error handling ────────────────────────────────────────────────────────

  it('throws PatchError for a JSON Pointer that does not start with /', () => {
    const state = makeState({ 'actor-1': { hp: 10 } });
    expect(() => applyPatches(state, [p('actor-1', 'hp', 'add', 5)])).toThrow(
      PatchError,
    );
  });

  it("throws PatchError when navigating past the '-' sentinel", () => {
    const state = makeState({ 'actor-1': { items: ['sword'] } });
    expect(() =>
      applyPatches(state, [p('actor-1', '/items/-/name', 'add', 'edge')]),
    ).toThrow(PatchError);
  });

  it('throws PatchError for a non-integer array index', () => {
    const state = makeState({ 'actor-1': { items: ['sword', 'shield'] } });
    expect(() =>
      applyPatches(state, [p('actor-1', '/items/foo', 'add', 'bow')]),
    ).toThrow(PatchError);
  });

  it('replaces a primitive node mid-path with an object on add', () => {
    // If a value at an intermediate segment is a primitive, setIn treats it as
    // an empty object and overwrites it — lenient RFC 6901 variant.
    const state = makeState({ 'actor-1': { count: 42 } });
    const result = applyPatches(state, [p('actor-1', '/count/sub', 'add', 99)]);
    expect(result.entities['actor-1']!['count']).toEqual({ sub: 99 });
  });

  it('removes a nested field inside an array element', () => {
    const state = makeState({
      'actor-1': { effects: [{ id: 'e1', name: 'Haste', duration: 3 }] },
    });
    const result = applyPatches(state, [
      p('actor-1', '/effects/0/name', 'remove'),
    ]);
    expect(result.entities['actor-1']!['effects']).toEqual([
      { id: 'e1', duration: 3 },
    ]);
  });

  it('removes a deeply nested field inside an object', () => {
    const state = makeState({
      'actor-1': { resources: { hp: { current: 10, max: 20 } } },
    });
    const result = applyPatches(state, [
      p('actor-1', '/resources/hp/max', 'remove'),
    ]);
    expect(result.entities['actor-1']!['resources']).toEqual({
      hp: { current: 10 },
    });
  });

  it('is a no-op when removing a sub-path from a primitive node', () => {
    // removeIn encounters a primitive mid-path and returns it unchanged
    const state = makeState({ 'actor-1': { count: 42 } });
    const result = applyPatches(state, [p('actor-1', '/count/sub', 'remove')]);
    expect(result.entities['actor-1']!['count']).toBe(42);
  });
});
