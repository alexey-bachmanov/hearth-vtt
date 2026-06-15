<script lang="ts">
  import type { Binding } from '@hearth-vtt/shared';
  import { resolveBinding, type BindingContext } from '../bindings';
  import { styleTokensToString } from '../styles';
  import { wsClient } from '../../../api/ws';

  interface Props {
    label: string;
    action: { actionType: string; payload: Record<string, unknown> };
    disabledWhen?: Binding;
    variant?: string;
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
    ctx: BindingContext;
  }
  let { label, action, disabledWhen, variant, style, sx, ctx }: Props = $props();

  const isDisabled = $derived(
    disabledWhen ? resolveBinding(disabledWhen, ctx) === true : false,
  );

  function handleClick() {
    wsClient.dispatch(action.actionType, action.payload);
  }
</script>

<button class="hearthml-btn"
  class:hearthml-btn--primary={variant === 'primary'}
  class:hearthml-btn--secondary={variant === 'secondary' || !variant}
  class:hearthml-btn--danger={variant === 'danger'}
  class:sx={sx?.class}
  style={styleTokensToString(style)}
  disabled={isDisabled}
  onclick={handleClick}>
  {label}
</button>
