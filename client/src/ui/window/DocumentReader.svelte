<script lang="ts">
/**
 * DocumentReader - Journal entry/handout viewer.
 * 
 * Displays rich text documents, handouts, and notes.
 */

interface Props {
  documentId: string;
}

let { documentId }: Props = $props();
</script>

<div class="document-reader">
  <div class="component-label">
    <strong>DocumentReader</strong>
  </div>
  <p class="component-description">
    Document: {documentId}
  </p>
  
  <div class="document-content">
    <h3>The Legend of Tiamat</h3>
    <p>
      Long ago, the dragon goddess Tiamat was sealed away by a group of
      legendary heroes. Her five heads represented the chromatic dragons:
      red, blue, green, black, and white.
    </p>
    <p>
      The seal weakens every thousand years, and only the chosen champions
      can renew it. The time of renewal is almost upon us...
    </p>
    <blockquote>
      "Five heads, one will. Beware the queen of dragons."
      <footer>— Ancient Prophecy</footer>
    </blockquote>
  </div>
</div>

<style>
  .document-reader {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
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

  .document-content {
    padding: var(--space-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    line-height: 1.6;
  }

  .document-content h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .document-content p {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  blockquote {
    margin: var(--space-md) 0;
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border-left: 3px solid var(--color-accent-primary);
    font-style: italic;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  blockquote footer {
    margin-top: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-style: normal;
  }
</style>
