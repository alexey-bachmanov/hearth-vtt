<script lang="ts">
  import type { PanelNode } from '@hearth-vtt/shared';
  import PanelRenderer from '../PanelRenderer.svelte';
  import { styleTokensToCSS } from '../styles';
  import type { BindingContext } from '../bindings';

  interface Props {
    children: PanelNode[];
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { children, style, sx, ctx }: Props = $props();
</script>

<div class="hearthml-vbox" class:sx={sx?.class}
  style={styleTokensToCSS(style)}>
  {#each children as child}
    <PanelRenderer node={child} {ctx} />
  {/each}
</div>
