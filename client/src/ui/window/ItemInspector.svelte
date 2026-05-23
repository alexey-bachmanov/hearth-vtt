<script lang="ts">
/**
 * ItemInspector - Item/spell detail viewer.
 * 
 * Shows detailed information about an item, spell, or ability.
 */
import { Icon } from '../shared';
import { Sword } from 'lucide-svelte';

interface Props {
  itemId: string;
}

let { itemId }: Props = $props();
</script>

<div class="item-inspector">
  <div class="component-label">
    <strong>ItemInspector</strong>
  </div>
  <p class="component-description">
    Item: {itemId}
  </p>
  
  <div class="item-details">
    <div class="item-header">
      <h3><Icon icon={Sword} label="Sword" /> Longsword +1</h3>
      <span class="item-rarity">Uncommon</span>
    </div>
    
    <div class="item-properties">
      <div class="property">
        <strong>Type:</strong> Martial Weapon (Sword)
      </div>
      <div class="property">
        <strong>Damage:</strong> 1d8 slashing
      </div>
      <div class="property">
        <strong>Weight:</strong> 3 lb.
      </div>
      <div class="property">
        <strong>Properties:</strong> Versatile (1d10)
      </div>
    </div>
    
    <div class="item-description">
      <p>
        You have a +1 bonus to attack and damage rolls made with this magic weapon.
      </p>
    </div>
  </div>
</div>

<style>
  .item-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .item-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .item-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .item-rarity {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-accent-primary);
    color: white;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
  }

  .item-properties {
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .property {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .property strong {
    color: var(--color-text-primary);
  }

  .item-description {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border-left: 3px solid var(--color-accent-primary);
    border-radius: var(--radius-sm);
  }

  .item-description p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }
</style>
