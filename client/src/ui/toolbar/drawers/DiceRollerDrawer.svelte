<script lang="ts">
/**
 * DiceRollerDrawer component.
 *
 * Dice rolling interface with preset dice buttons and custom formula editor.
 */
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Quick Roll</h3>
    <div class="dice-grid">
      <button class="btn btn--sm">d4</button>
      <button class="btn btn--sm">d6</button>
      <button class="btn btn--sm">d8</button>
      <button class="btn btn--sm">d10</button>
      <button class="btn btn--sm">d12</button>
      <button class="btn btn--sm">d20</button>
      <button class="btn btn--sm">d100</button>
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Custom Formula</h3>
    <input
      type="text"
      class="form-input"
      placeholder="e.g., 2d6+3"
      aria-label="Dice formula"
    />
    <button class="btn btn--primary" style="margin-top: 0.5rem;">Roll</button>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Recent Rolls</h3>
    <p class="text--secondary">No recent rolls</p>
  </div>
</div>

<style>
  .dice-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-sm);
  }
</style>
