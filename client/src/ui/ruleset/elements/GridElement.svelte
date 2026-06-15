<script lang="ts">
  import type { PanelNode } from '@hearth-vtt/shared';
  import PanelRenderer from '../PanelRenderer.svelte';
  import { styleTokensToCSS } from '../styles';
  import type { BindingContext } from '../bindings';

  interface Props {
    columns: number;
    children: PanelNode[];
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { columns, children, style, sx, ctx }: Props = $props();
</script>

<div class="hearthml-grid" class:sx={sx?.class}
  style="display:grid;grid-template-columns:repeat({columns},1fr);{Object.entries(styleTokensToCSS(style)).map(([k,v]) => `${k}:${v}`).join(';')}">
  {#each children as child}
    <PanelRenderer node={child} {ctx} />
  {/each}
</div>
