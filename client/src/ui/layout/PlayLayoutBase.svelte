<script lang="ts">
  /**
   * PlayLayoutBase - Base layer for the play UI.
   *
   * Bottom-most layer containing:
   * - LeftToolbar (56px fixed width)
   * - MainCanvas (WebGL render target, fills remaining space)
   *
   * Uses flexbox for layout. This layer provides the visual background;
   * interactive UI elements are in the overlay layer above.
   */

  import { LeftToolbar } from '../toolbar';
  import { MainCanvas } from '../canvas';
</script>

<div class="play-layout-base">
  <nav class="landmark" aria-label="Tools">
    <LeftToolbar />
  </nav>
  <main class="landmark" id="main-content">
    <MainCanvas />
  </main>
</div>

<style>
  .play-layout-base {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
    z-index: var(--z-canvas);
  }

  /* Landmark wrappers are semantically present but invisible to the flex
     layout algorithm so they don't disrupt the toolbar + canvas flex row. */
  .landmark {
    display: contents;
  }
</style>
