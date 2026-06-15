<script lang="ts">
  import type { Binding, PanelNode } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import PanelRenderer from '../PanelRenderer.svelte';
  import { styleTokensToCSS } from '../styles';

  interface Props {
    source: Binding;
    as: string;
    children: PanelNode[];
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { source, as, children, style, sx, ctx }: Props = $props();

  const items = $derived<unknown[]>(resolveBinding(source, ctx) as unknown[] ?? []);
</script>

<div class="hearthml-forEach" class:sx={sx?.class} style={styleTokensToCSS(style)}>
  {#each items as item, idx}
    {#each children as child}
      <PanelRenderer
        node={child}
        ctx={{ scope: { ...ctx.scope, [as]: item, $index: idx } }}
      />
    {/each}
  {/each}
</div>
