<script lang="ts">
  import type { Binding } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import { styleTokensToString } from '../styles';

  interface Props {
    valueBinding: Binding;
    maxBinding: Binding;
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { valueBinding, maxBinding, style, sx, ctx }: Props = $props();

  const val = $derived(Number(resolveBinding(valueBinding, ctx)) || 0);
  const max = $derived(Number(resolveBinding(maxBinding, ctx)) || 100);
</script>

<progress class="hearthml-progress" class:sx={sx?.class}
  value={val} max={max} style={styleTokensToString(style)}>
</progress>
