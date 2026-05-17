<script lang="ts">
/**
 * AdminTree - Tree navigator for admin hierarchy.
 * 
 * Displays expandable/collapsible tree structure:
 * - Server (root)
 *   - Campaign 1
 *     - Seat 1
 *     - Seat 2
 *   - Campaign 2
 *     - Seat 3
 * 
 * Each node is selectable to show details in main content area.
 */

interface TreeNode {
  id: string;
  type: 'server' | 'campaign' | 'seat';
  label: string;
  children?: TreeNode[];
  expanded?: boolean;
}

interface Props {
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string, nodeType: 'server' | 'campaign' | 'seat') => void;
}

let { selectedNodeId, onSelectNode }: Props = $props();

// Mock tree structure - in real app, this would be loaded from API
let treeData = $state<TreeNode>({
  id: 'server',
  type: 'server',
  label: 'Server',
  expanded: true,
  children: [
    {
      id: 'campaign-1',
      type: 'campaign',
      label: 'Campaign 1',
      expanded: false,
      children: [
        { id: 'seat-1', type: 'seat', label: 'GM Seat' },
        { id: 'seat-2', type: 'seat', label: 'Player 1' },
      ],
    },
    {
      id: 'campaign-2',
      type: 'campaign',
      label: 'Campaign 2',
      expanded: false,
      children: [
        { id: 'seat-3', type: 'seat', label: 'GM Seat' },
      ],
    },
  ],
});

function toggleExpanded(node: TreeNode) {
  node.expanded = !node.expanded;
}

function handleSelectNode(node: TreeNode) {
  onSelectNode(node.id, node.type);
}

function getNodeIcon(type: 'server' | 'campaign' | 'seat'): string {
  switch (type) {
    case 'server': return '🖥️';
    case 'campaign': return '📁';
    case 'seat': return '👤';
  }
}
</script>

<div class="admin-tree">
  <div class="tree-header">
    <h3>Navigation</h3>
  </div>
  
  <div class="tree-content">
    {@render TreeNodeView( 
      treeData, 
      selectedNodeId, 
      toggleExpanded,
      handleSelectNode,
      0
    )}
  </div>
</div>

<!-- Recursive tree node component -->
{#snippet TreeNodeView(node: TreeNode, selectedNodeId: string | null, onToggle: (n: TreeNode) => void, onSelect: (n: TreeNode) => void, depth: number)}
  <div class="tree-node" style="--depth: {depth}">
    <button 
      class="node-button"
      class:node-button--selected={node.id === selectedNodeId}
      onclick={() => onSelect(node)}
    >
      {#if node.children && node.children.length > 0}
        <span 
          class="expand-icon" 
          onclick={(e) => { e.stopPropagation(); onToggle(node); }}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(node); } }}
          aria-label={node.expanded ? 'Collapse' : 'Expand'}
        >
          {node.expanded ? '▼' : '▶'}
        </span>
      {:else}
        <span class="expand-spacer"></span>
      {/if}
      
      <span class="node-icon">{getNodeIcon(node.type)}</span>
      <span class="node-label">{node.label}</span>
    </button>
    
    {#if node.expanded && node.children}
      <div class="node-children">
        {#each node.children as child (child.id)}
          {@render TreeNodeView( 
            child, 
            selectedNodeId, 
            onToggle, 
            onSelect, 
            depth + 1 
          )}
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
    padding: var(--space-lg);
    border-bottom: 1px solid var(--color-border-default);
  }

  .tree-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  .tree-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }

  .tree-node {
    margin-bottom: var(--space-xs);
  }

  .node-button {
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    padding-left: calc(var(--space-md) + var(--depth) * var(--space-xl));
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .node-button:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .node-button--selected {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }

  .expand-icon {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: var(--space-xs);
    font-size: 10px;
    cursor: pointer;
  }

  .expand-spacer {
    width: var(--icon-size-sm);
    margin-right: var(--space-xs);
  }

  .node-icon {
    margin-right: var(--space-sm);
    font-size: var(--font-size-md);
  }

  .node-label {
    flex: 1;
  }

  .node-children {
    margin-left: 0;
  }
</style>
