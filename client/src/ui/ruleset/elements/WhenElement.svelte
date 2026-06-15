<script lang="ts">
  import type { Binding, PanelNode } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import PanelRenderer from '../PanelRenderer.svelte';
  import { styleTokensToString } from '../styles';

  interface Props {
    condition: Binding;
    children: PanelNode[];
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { condition, children, style, sx, ctx }: Props = $props();

  const show = $derived(resolveBinding(condition, ctx) === true);
</script>

{#if show}
  <div class="hearthml-when" class:sx={sx?.class} style={styleTokensToString(style)}>
    {#each children as child (child)}
      <PanelRenderer node={child} {ctx} />
    {/each}
  </div>
{/if}
