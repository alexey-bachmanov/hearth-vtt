/**
 * PlayLayout accessibility tests.
 *
 * Verifies that the play UI has the correct landmark regions and a functional
 * skip-link. Landmarks are added via display:contents wrappers so they are
 * present in the accessibility tree without disturbing the flex layout.
 *
 * The render module is mocked so MainCanvas never attempts WebGL init in
 * happy-dom.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// Must be declared before the component imports so Vitest can hoist it.
vi.mock('../../render', () => ({
  createRenderer: vi.fn().mockResolvedValue({
    init: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    setScene: vi.fn(),
    updateTokens: vi.fn(),
    setViewport: vi.fn(),
    setSelection: vi.fn(),
    setHover: vi.fn(),
    setTokenDragPreview: vi.fn(),
    clearTokenDragPreview: vi.fn(),
    hitTestToken: vi.fn().mockReturnValue(null),
  }),
}));

import PlayLayout from './PlayLayout.svelte';

describe('PlayLayout landmarks and skip link', () => {
  it('has a skip-link to the main content', () => {
    render(PlayLayout);
    const link = screen.getByRole('link', { name: /skip to canvas/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('has a navigation landmark labeled "Tools"', () => {
    render(PlayLayout);
    expect(
      screen.getByRole('navigation', { name: 'Tools' }),
    ).toBeInTheDocument();
  });

  it('has a main landmark with id "main-content"', () => {
    render(PlayLayout);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('has a complementary landmark labeled "Chat"', () => {
    render(PlayLayout);
    expect(
      screen.getByRole('complementary', { name: 'Chat' }),
    ).toBeInTheDocument();
  });
});
