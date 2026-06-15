<script lang="ts">
  import { styleTokensToString } from '../styles';

  interface Props {
    name: string;
    style?: import('@hearth-vtt/shared').StyleTokens;
    sx?: import('@hearth-vtt/shared').SxProps;
  }
  let { name, style, sx }: Props = $props();
</script>

<span class="hearthml-icon {name}" class:sx={sx?.class}
  style={styleTokensToString(style)}
  aria-hidden="true">
</span>
