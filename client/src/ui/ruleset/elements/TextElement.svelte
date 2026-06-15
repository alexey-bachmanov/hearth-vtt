<script lang="ts">
  import type { Binding } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import { styleTokensToString } from '../styles';

  interface Props {
    binding: Binding;
    format?: string;
    formatArgs?: Record<string, string | number | boolean>;
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { binding, format, formatArgs: _formatArgs, style, sx, ctx }: Props = $props();

  const rawValue = $derived(resolveBinding(binding, ctx));
  const displayValue = $derived(formatValue(rawValue, format));
</script>

<span class="hearthml-text" class:sx={sx?.class} style={styleTokensToString(style)}>
  {displayValue}
</span>

<script context="module" lang="ts">
function formatValue(value: unknown, format?: string): string {
  if (format === 'plusMinus') {
    if (typeof value !== 'number') return String(value ?? '');
    if (value > 0) return `+${value}`;
    if (value < 0) return `−${Math.abs(value)}`;
    return '0';
  }
  if (format === 'fraction') {
    if (value && typeof value === 'object') {
      const v = value as { current?: number; max?: number };
      return `${v.current ?? '?'} / ${v.max ?? '?'}`;
    }
    return String(value ?? '');
  }
  return String(value ?? '');
}
</script>
