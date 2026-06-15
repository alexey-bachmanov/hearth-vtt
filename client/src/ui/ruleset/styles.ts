/**
 * Style token → CSS custom property mapping for HearthML panels.
 *
 * Converts the constrained StyleTokens type (defined in shared/src/ruleset-ui.ts)
 * into CSS custom property values. Each token maps to a CSS variable defined
 * in the client's theme, ensuring consistent look across all ruleset panels.
 *
 * This is NOT a general CSS-in-JS solution. It's a closed set of tokens
 * that map to a closed set of CSS custom properties. Ruleset authors who
 * need custom styling use the `sx.class` escape hatch instead.
 */

import type { StyleTokens } from '@hearth-vtt/shared';

/**
 * Convert HearthML style tokens to an object of CSS property-value pairs.
 *
 * Each token maps to a CSS custom property (e.g., `var(--space-md)` for
 * padding: 'md').
 */
export function styleTokensToCSS(tokens?: StyleTokens): Record<string, string> {
  if (!tokens) return {};

  const css: Record<string, string> = {};

  if (tokens.padding) css.padding = `var(--space-${tokens.padding})`;
  if (tokens.gap) css.gap = `var(--space-${tokens.gap})`;
  if (tokens.flex !== undefined) css.flex = String(tokens.flex);
  if (tokens.textVariant)
    css.fontSize = `var(--font-size-${tokens.textVariant})`;
  if (tokens.color) css.color = `var(--color-text-${tokens.color})`;
  if (tokens.bg) css.background = `var(--color-bg-${tokens.bg})`;
  if (tokens.width !== undefined) css.width = `${tokens.width}px`;
  if (tokens.height !== undefined) css.height = `${tokens.height}px`;
  if (tokens.alignItems) css.alignItems = tokens.alignItems;
  if (tokens.justifyContent) {
    css.justifyContent =
      tokens.justifyContent === 'between'
        ? 'space-between'
        : tokens.justifyContent;
  }

  return css;
}

/**
 * Convert style tokens to an inline CSS string suitable for Svelte's
 * `style` attribute.
 *
 * Svelte 5 requires style to be a string (not an object), unlike React.
 *
 * @example
 * ```svelte
 * <div style={styleTokensToString(node.style)}>
 * ```
 */
export function styleTokensToString(tokens?: StyleTokens): string {
  const css = styleTokensToCSS(tokens);
  return Object.entries(css)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}
