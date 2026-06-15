<script lang="ts">
  import type { Binding, PanelNode } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import PanelRenderer from '../PanelRenderer.svelte';
  import { styleTokensToString } from '../styles';

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

<div class="hearthml-forEach" class:sx={sx?.class} style={styleTokensToString(style)}>
  {#each items as item, idx (item)}
    {#each children as child (child)}
      <PanelRenderer
        node={child}
        ctx={{ scope: { ...ctx.scope, [as]: item, $index: idx } }}
      />
    {/each}
  {/each}
</div>
