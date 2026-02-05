<script lang="ts">
/**
 * DiceRoller - Quick dice rolling tool.
 * 
 * Buttons for common dice rolls (d20, d6, etc.).
 */

let lastRoll = $state<string>('');

function rollDice(sides: number) {
  const result = Math.floor(Math.random() * sides) + 1;
  lastRoll = `d${sides}: ${result}`;
}
</script>

<div class="dice-roller">
  <button class="dice-button" onclick={() => rollDice(20)}>d20</button>
  <button class="dice-button" onclick={() => rollDice(12)}>d12</button>
  <button class="dice-button" onclick={() => rollDice(10)}>d10</button>
  <button class="dice-button" onclick={() => rollDice(8)}>d8</button>
  <button class="dice-button" onclick={() => rollDice(6)}>d6</button>
  <button class="dice-button" onclick={() => rollDice(4)}>d4</button>
  {#if lastRoll}
    <span class="last-roll">{lastRoll}</span>
  {/if}
</div>

<style>
  .dice-roller {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .dice-button {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .dice-button:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }

  .dice-button:active {
    transform: scale(0.95);
  }

  .last-roll {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-accent-primary);
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }
</style>
