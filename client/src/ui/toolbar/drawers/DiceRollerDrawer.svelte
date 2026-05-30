<script lang="ts">
/**
 * DiceRollerDrawer component.
 *
 * Dice rolling interface with preset dice buttons and custom formula editor.
 */
import { wsClient } from '../../../api';

const DICE_FORMULA_PREFLIGHT = /^[0-9dkhlrf<>=!+\-*/()\s]+$/i;

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

let customFormula = $state('');
let formulaError = $state('');

function rollQuick(sides: number) {
  wsClient.dispatch('dice.roll', { formula: `1d${sides}` });
}

function rollCustom() {
  const formula = customFormula.trim();
  if (!formula) return;
  if (!DICE_FORMULA_PREFLIGHT.test(formula)) {
    formulaError = 'Invalid dice formula.';
    return;
  }
  formulaError = '';
  wsClient.dispatch('dice.roll', { formula });
}
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <h3 class="drawer__section-title">Quick Roll</h3>
    <div class="dice-grid">
      {#each QUICK_DICE as sides (sides)}
        <button class="btn btn--sm" onclick={() => rollQuick(sides)}>d{sides}</button>
      {/each}
    </div>
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Custom Formula</h3>
    <input
      type="text"
      class="form-input"
      placeholder="e.g., 2d6+3"
      aria-label="Dice formula"
      bind:value={customFormula}
    />
    {#if formulaError}
      <p class="formula-error" role="alert">{formulaError}</p>
    {/if}
    <button class="btn btn--primary" style="margin-top: 0.5rem;" onclick={rollCustom}>Roll</button>
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

  .formula-error {
    margin-top: var(--space-xs, 0.25rem);
    font-size: 0.8rem;
    color: var(--color-error, #d9534f);
  }
</style>
