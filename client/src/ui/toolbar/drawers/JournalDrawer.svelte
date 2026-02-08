<script lang="ts">
/**
 * JournalDrawer component.
 *
 * Campaign notes and handouts browser.
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <input
      type="search"
      class="form-input"
      placeholder="Search journal entries..."
      aria-label="Search journal"
    />
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Recent Entries</h3>
    <div class="journal-list">
      <button class="journal-item">
        <span class="journal-item__icon">📄</span>
        <span class="journal-item__name">Session Notes - Week 1</span>
      </button>
      <button class="journal-item">
        <span class="journal-item__icon">📄</span>
        <span class="journal-item__name">NPC Directory</span>
      </button>
      <button class="journal-item">
        <span class="journal-item__icon">📄</span>
        <span class="journal-item__name">Quest Log</span>
      </button>
    </div>
  </div>

  <div class="drawer-section">
    <button class="btn btn-primary">New Entry</button>
  </div>
</div>

<style>
  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .journal-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .journal-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: transparent;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .journal-item:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }

  .journal-item__icon {
    font-size: var(--font-size-xl);
  }

  .journal-item__name {
    flex: 1;
    color: var(--color-text-primary);
  }
</style>
