<script lang="ts">
/**
 * AdminTree - Tree navigator for the admin panel.
 *
 * Renders the full admin navigation tree using state from `adminTree`
 * (see client/src/state/admin.svelte.ts). All node selection and
 * expansion is delegated to the store — this component is pure
 * presentation.
 *
 * Tree structure (top to bottom):
 *   ⚙  Settings   (leaf — server info + admin password)
 *   📁 Campaigns  (expandable)
 *      └ 📁 <Campaign>  (expandable)
 *         └ 👤/👑 <Seat>  (leaf)
 *   👥 Accounts  (expandable)
 *      └ 👤 <Account>  (leaf)
 */

import { adminTree, type AdminTreeNode } from '../../state/admin.svelte.js';
</script>

<nav class="admin-tree" aria-label="Admin navigation">
  <div class="tree-header">
    <span class="tree-title">Navigation</span>
  </div>

  <div class="tree-content">
    {#each adminTree.rootIds as rootId (rootId)}
      {@const node = adminTree.getNode(rootId)}
      {#if node}
        {@render treeNode(node, 0)}
      {/if}
    {/each}
  </div>
</nav>

{#snippet treeNode(node: AdminTreeNode, depth: number)}
  <div class="tree-node">
    <button
      class="node-btn"
      class:node-btn--selected={adminTree.isSelected(node.id)}
      class:node-btn--branch={!!node.children?.length}
      style="--depth: {depth}"
      onclick={() => {
        if (node.children?.length) adminTree.toggleExpanded(node.id);
        adminTree.navigateTo(node.id);
      }}
      aria-expanded={node.children?.length ? adminTree.isExpanded(node.id) : undefined}
      aria-current={adminTree.isSelected(node.id) ? 'page' : undefined}
    >
      <span class="node-chevron" aria-hidden="true">
        {#if node.children?.length}
          {adminTree.isExpanded(node.id) ? '▾' : '▸'}
        {:else}
          &nbsp;
        {/if}
      </span>
      <span class="node-label">{node.label}</span>
    </button>

    {#if node.children?.length && adminTree.isExpanded(node.id)}
      <div class="node-children" role="group">
        {#each node.children as childId (childId)}
          {@const child = adminTree.getNode(childId)}
          {#if child}
            {@render treeNode(child, depth + 1)}
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}


<style>
  .admin-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-bg-secondary);
  }

  .tree-header {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-default);
    flex-shrink: 0;
  }

  .tree-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tree-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm) var(--space-xs);
  }

  .node-btn {
    display: flex;
    align-items: center;
    width: 100%;
    /* depth-based indentation: each level adds 16px */
    padding: var(--space-sm) var(--space-md);
    padding-left: calc(var(--space-sm) + var(--depth, 0) * var(--space-lg));
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
    gap: var(--space-xs);
  }

  .node-btn:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .node-btn--selected {
    background-color: var(--color-accent-faint);
    border-color: var(--color-accent-primary);
    color: var(--color-accent-primary);
    font-weight: var(--font-weight-semibold);
  }

  .node-chevron {
    width: 12px;
    flex-shrink: 0;
    font-size: 10px;
    color: var(--color-text-tertiary);
    display: inline-flex;
    align-items: center;
  }

  .node-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

</style>
