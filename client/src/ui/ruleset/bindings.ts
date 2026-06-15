/**
 * Binding resolver for HearthML panel data bindings.
 *
 * Resolves discriminated-union bindings against the client's CampaignState
 * store. Called by PanelRenderer.svelte during Svelte 5 render cycles.
 * Each `resolveBinding()` call reads Svelte-reactive stores, so the
 * framework tracks which bindings were read and re-renders only when those
 * dependencies change.
 *
 * @see shared/src/ruleset-ui.ts for the Binding type definitions.
 */

import type { Binding } from '@hearth-vtt/shared';
import { campaignState } from '../../state/campaign.svelte';

/**
 * Resolution context provided by PanelRenderer for a specific panel rendering.
 * Carries scope variables that `${varName}` template placeholders reference.
 */
export interface BindingContext {
  /** Scope variables (e.g., actorId from parent scope, forEach items). */
  scope: Record<string, unknown>;
}

/**
 * Resolve a single HearthML binding against the current CampaignState.
 *
 * Returns the raw value (string, number, boolean, object, or undefined).
 * The caller (PanelRenderer / element component) formats the value as needed.
 *
 * @param binding - The binding declaration from the PanelDef
 * @param ctx - Resolution context (scope variables)
 * @returns The resolved value, or undefined if the data is missing
 */
export function resolveBinding(
  binding: Binding,
  ctx: BindingContext,
): unknown {
  switch (binding.kind) {
    case 'actor.data': {
      const actorId = resolveTemplateStrings(binding.actorId, ctx.scope);
      return campaignState.actors.get(actorId)?.data?.[binding.key];
    }

    case 'campaignData':
      return campaignState.getCampaignData(binding.key);

    case 'eventState': {
      const event = campaignState.eventState(binding.eventType);
      if (!event) return undefined;
      return getNestedValue(event, binding.path);
    }

    case 'literal':
      return binding.value;
  }
}

/**
 * Resolve `${varName}` template placeholders in a string against the scope.
 *
 * This is the ONLY interpolation the binding system supports. It resolves
 * scope variables injected by `forEach` iterations (`${item.name}`) and by
 * the panel rendering context (`${scope.actorId}`).
 *
 * Not a template language. No path traversal, no expressions, no conditionals.
 */
export function resolveTemplateStrings(
  template: string,
  scope: Record<string, unknown>,
): string {
  return template.replace(/\$\{(\w+)\}/g, (_, name: string) =>
    String(scope[name] ?? ''),
  );
}

/**
 * Safely access a nested property by dotted path.
 * Returns undefined for missing intermediate keys.
 *
 * Example: getNestedValue({ a: { b: 3 } }, 'a.b') → 3
 */
export function getNestedValue(
  obj: unknown,
  path: string,
): unknown {
  return path.split('.').reduce(
    (acc: unknown, key: string) =>
      acc !== null && acc !== undefined
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}
