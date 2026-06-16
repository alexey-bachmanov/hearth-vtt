<script lang="ts">
  /**
   * PanelRenderer — recursive HearthML tree walker.
   *
   * Receives a PanelNode and resolves it to the appropriate Svelte element
   * component based on the node's `kind` field. This is the single entry
   * point for rendering any ruleset-defined UI subtree.
   *
   * Data bindings are resolved against the provided BindingContext, which
   * carries scope variables from parent containers (forEach items, scope
   * injections).
   */

  import type { PanelNode } from '@hearth-vtt/shared';
  import type { BindingContext } from './bindings';

  import TextElement from './elements/TextElement.svelte';
  import ProgressElement from './elements/ProgressElement.svelte';
  import ButtonElement from './elements/ButtonElement.svelte';
  import IconElement from './elements/IconElement.svelte';
  import DividerElement from './elements/DividerElement.svelte';
  import HBoxElement from './elements/HBoxElement.svelte';
  import VBoxElement from './elements/VBoxElement.svelte';
  import GridElement from './elements/GridElement.svelte';
  import ForEachElement from './elements/ForEachElement.svelte';
  import WhenElement from './elements/WhenElement.svelte';

  interface Props {
    node: PanelNode;
    ctx: BindingContext;
  }

  let { node, ctx }: Props = $props();
</script>

{#if node.kind === 'text'}
  <TextElement
    binding={node.binding}
    format={node.format}
    formatArgs={node.formatArgs}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'progress'}
  <ProgressElement
    valueBinding={node.value}
    maxBinding={node.max}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'button'}
  <ButtonElement
    label={node.label}
    action={node.action}
    disabledWhen={node.disabledWhen}
    variant={node.variant}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'icon'}
  <IconElement
    name={node.name}
    style={node.style}
    sx={node.sx}
  />
{:else if node.kind === 'divider'}
  <DividerElement
    style={node.style}
    sx={node.sx}
  />
{:else if node.kind === 'hbox'}
  <HBoxElement
    children={node.children}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'vbox'}
  <VBoxElement
    children={node.children}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'grid'}
  <GridElement
    columns={node.columns}
    children={node.children}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'forEach'}
  <ForEachElement
    source={node.source}
    as={node.as}
    children={node.children}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{:else if node.kind === 'when'}
  <WhenElement
    condition={node.condition}
    children={node.children}
    style={node.style}
    sx={node.sx}
    {ctx}
  />
{/if}
