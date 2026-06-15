/**
 * HearthML — ruleset-defined UI type definitions.
 *
 * These types define a constrained declarative component tree that ruleset
 * authors use to define UI panels. The tree is JSON-serializable and survives
 * the QuickJS boundary.
 *
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md
 */

import { z } from 'zod';

// ============================================================================
// Binding — discriminated union of data sources
// ============================================================================

export const bindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('actor.data'),
    actorId: z.string(),
    key: z.string(),
  }),
  z.object({ kind: z.literal('campaignData'), key: z.string() }),
  z.object({
    kind: z.literal('eventState'),
    eventType: z.string(),
    path: z.string(),
  }),
  z.object({
    kind: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);

export type Binding = z.infer<typeof bindingSchema>;

// ============================================================================
// StyleTokens — constrained palette mapped to CSS custom properties
// ============================================================================

export const styleTokensSchema = z
  .object({
    padding: z.enum(['none', 'xs', 'sm', 'md', 'lg']).optional(),
    gap: z.enum(['none', 'xs', 'sm', 'md', 'lg']).optional(),
    flex: z.number().optional(),
    textVariant: z.enum(['body', 'caption', 'h3', 'h4']).optional(),
    color: z
      .enum(['default', 'muted', 'accent', 'danger', 'success', 'warning'])
      .optional(),
    bg: z.enum(['none', 'surface', 'elevated']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    alignItems: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    justifyContent: z.enum(['start', 'center', 'end', 'between']).optional(),
  })
  .strict();

export type StyleTokens = z.infer<typeof styleTokensSchema>;

export const sxPropsSchema = z.object({ class: z.string().optional() });
export type SxProps = z.infer<typeof sxPropsSchema>;

// ============================================================================
// PanelNode — recursive union of UI primitives (10 for V1)
// ============================================================================

// ── Leaf node types ─────────────────────────────────────────────────────────

export interface TextNode {
  kind: 'text';
  binding: Binding;
  format?: 'none' | 'plusMinus' | 'fraction' | 'diceFormula' | 'diceWithMods';
  formatArgs?: Record<string, string | number | boolean>;
  style?: StyleTokens;
  sx?: SxProps;
}

export interface ProgressNode {
  kind: 'progress';
  value: Binding;
  max: Binding;
  style?: StyleTokens;
  sx?: SxProps;
}

export interface ButtonNode {
  kind: 'button';
  label: string;
  action: { actionType: string; payload: Record<string, unknown> };
  disabledWhen?: Binding;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleTokens;
  sx?: SxProps;
}

export interface IconNode {
  kind: 'icon';
  name: string;
  style?: StyleTokens;
  sx?: SxProps;
}

export interface DividerNode {
  kind: 'divider';
  style?: StyleTokens;
  sx?: SxProps;
}

// ── Container node types (recursive — reference PanelNode) ──────────────────

export interface HBoxNode {
  kind: 'hbox';
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}

export interface VBoxNode {
  kind: 'vbox';
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}

export interface GridNode {
  kind: 'grid';
  columns: number;
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}

export interface ForEachNode {
  kind: 'forEach';
  source: Binding;
  as: string;
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}

export interface WhenNode {
  kind: 'when';
  condition: Binding;
  children: PanelNode[];
  style?: StyleTokens;
  sx?: SxProps;
}

// ── Union ───────────────────────────────────────────────────────────────────

export type PanelNode =
  | TextNode
  | ProgressNode
  | ButtonNode
  | IconNode
  | DividerNode
  | HBoxNode
  | VBoxNode
  | GridNode
  | ForEachNode
  | WhenNode;

// ── Zod schema for PanelNode (recursive via z.late union) ───────────────────

const textNodeSchema: z.ZodType<TextNode> = z.object({
  kind: z.literal('text'),
  binding: bindingSchema,
  format: z
    .enum(['none', 'plusMinus', 'fraction', 'diceFormula', 'diceWithMods'])
    .optional(),
  formatArgs: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const progressNodeSchema: z.ZodType<ProgressNode> = z.object({
  kind: z.literal('progress'),
  value: bindingSchema,
  max: bindingSchema,
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const buttonNodeSchema: z.ZodType<ButtonNode> = z.object({
  kind: z.literal('button'),
  label: z.string(),
  action: z.object({
    actionType: z.string(),
    payload: z.record(z.string(), z.unknown()),
  }),
  disabledWhen: bindingSchema.optional(),
  variant: z.enum(['primary', 'secondary', 'danger']).optional(),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const iconNodeSchema: z.ZodType<IconNode> = z.object({
  kind: z.literal('icon'),
  name: z.string(),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const dividerNodeSchema: z.ZodType<DividerNode> = z.object({
  kind: z.literal('divider'),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

// Container schemas use z.lazy for the recursive children reference.
// They have explicit z.ZodType<T> annotations so TS knows the exact shape.

const hBoxNodeSchema: z.ZodType<HBoxNode> = z.object({
  kind: z.literal('hbox'),
  children: z.array(z.lazy(() => panelNodeSchema)),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const vBoxNodeSchema: z.ZodType<VBoxNode> = z.object({
  kind: z.literal('vbox'),
  children: z.array(z.lazy(() => panelNodeSchema)),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const gridNodeSchema: z.ZodType<GridNode> = z.object({
  kind: z.literal('grid'),
  columns: z.number().int().min(1).max(12),
  children: z.array(z.lazy(() => panelNodeSchema)),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const forEachNodeSchema: z.ZodType<ForEachNode> = z.object({
  kind: z.literal('forEach'),
  source: bindingSchema,
  as: z.string(),
  children: z.array(z.lazy(() => panelNodeSchema)),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

const whenNodeSchema: z.ZodType<WhenNode> = z.object({
  kind: z.literal('when'),
  condition: bindingSchema,
  children: z.array(z.lazy(() => panelNodeSchema)),
  style: styleTokensSchema.optional(),
  sx: sxPropsSchema.optional(),
});

/**
 * Zod schema for PanelNode. Uses a union of discriminated schema objects
 * so that at runtime the result is validated against the correct variant
 * based on the `kind` field.
 */
export const panelNodeSchema: z.ZodType<PanelNode> = z.lazy(() =>
  z.union([
    textNodeSchema,
    progressNodeSchema,
    buttonNodeSchema,
    iconNodeSchema,
    dividerNodeSchema,
    hBoxNodeSchema,
    vBoxNodeSchema,
    gridNodeSchema,
    forEachNodeSchema,
    whenNodeSchema,
  ]),
);

// ============================================================================
// PanelDef — top-level panel registration
// ============================================================================

export const panelSlotSchema = z.enum(['toolbar', 'actor-pill', 'window']);
export type PanelSlot = z.infer<typeof panelSlotSchema>;

export const panelDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  slot: panelSlotSchema,
  content: panelNodeSchema,
  replaces: z.string().optional(),
});

export type PanelDef = z.infer<typeof panelDefSchema>;
