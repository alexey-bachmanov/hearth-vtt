<script lang="ts">
  import { styleTokensToString } from '../styles';

  interface Props {
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
  }
  let { style, sx }: Props = $props();
</script>

<hr class="hearthml-divider" class:sx={sx?.class}
  style={styleTokensToString(style)} />
