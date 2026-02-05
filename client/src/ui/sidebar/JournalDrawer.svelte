<script lang="ts">
/**
 * JournalDrawer - Campaign notes and handouts.
 * 
 * Browse journal entries, handouts, and campaign notes.
 */
</script>

<div class="journal-drawer">
  <div class="component-label">
    <strong>JournalDrawer</strong>
  </div>
  <p class="component-description">
    Campaign notes, handouts, lore entries
  </p>
  <div class="placeholder-content">
    <div class="journal-list">
      <div class="journal-item">📄 Session 1 Notes</div>
      <div class="journal-item">📄 The Legend of Tiamat</div>
      <div class="journal-item">📄 NPC: Elara the Merchant</div>
      <div class="journal-item">📄 Quest: Find the Lost Amulet</div>
    </div>
  </div>
</div>

<style>
  .journal-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .component-label strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .component-description {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .placeholder-content {
    margin-top: var(--space-md);
  }

  .journal-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .journal-item {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .journal-item:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
