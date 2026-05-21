import { describe, it, expect, beforeEach } from 'vitest';
import { uiState, WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT } from './ui.svelte.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  uiState.reset();
});

// ---------------------------------------------------------------------------
// Tool drawer toggle
// ---------------------------------------------------------------------------

describe('toggleToolDrawer()', () => {
  it("sets activeToolDrawer to 'dice' when toggled on", () => {
    uiState.toggleToolDrawer('dice');
    expect(uiState.activeToolDrawer).toBe('dice');
  });

  it("sets activeToolDrawer to null when toggled off (same drawer)", () => {
    uiState.toggleToolDrawer('dice');
    uiState.toggleToolDrawer('dice');
    expect(uiState.activeToolDrawer).toBeNull();
  });

  it("switches to a different drawer when toggled while one is open", () => {
    uiState.toggleToolDrawer('dice');
    uiState.toggleToolDrawer('journal');
    expect(uiState.activeToolDrawer).toBe('journal');
  });
});

describe('closeToolDrawer()', () => {
  it("sets activeToolDrawer to null", () => {
    uiState.toggleToolDrawer('dice');
    uiState.closeToolDrawer();
    expect(uiState.activeToolDrawer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// openWindow()
// ---------------------------------------------------------------------------

describe('openWindow()', () => {
  it('adds an entry to openWindows and a group to windowGroups', () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'Hero' });
    expect(uiState.openWindows.size).toBe(1);
    expect(uiState.windowGroups.size).toBe(1);
  });

  it('returns a window ID string', () => {
    const id = uiState.openWindow({ type: 'actor-sheet', title: 'Hero' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it("the group's activeTabId matches the returned window ID", () => {
    const id = uiState.openWindow({ type: 'actor-sheet', title: 'Hero' });
    const group = [...uiState.windowGroups.values()][0];
    expect(group.activeTabId).toBe(id);
  });

  it('uses WINDOW_DEFAULT_WIDTH × WINDOW_DEFAULT_HEIGHT when no size is specified', () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'Hero' });
    const group = [...uiState.windowGroups.values()][0];
    expect(group.width).toBe(WINDOW_DEFAULT_WIDTH);
    expect(group.height).toBe(WINDOW_DEFAULT_HEIGHT);
  });

  it('respects a custom position', () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'Hero', position: { x: 50, y: 75 } });
    const group = [...uiState.windowGroups.values()][0];
    expect(group.x).toBe(50);
    expect(group.y).toBe(75);
  });

  it('staggers the position of the second window relative to the first', () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'First' });
    uiState.openWindow({ type: 'actor-sheet', title: 'Second' });
    const groups = [...uiState.windowGroups.values()];
    expect(groups).toHaveLength(2);
    const [first, second] = groups;
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it('opening 2 windows creates 2 groups', () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'A' });
    uiState.openWindow({ type: 'settings', title: 'B' });
    expect(uiState.windowGroups.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// closeTab()
// ---------------------------------------------------------------------------

describe('closeTab()', () => {
  it('removes the window and the group when closing the only tab', () => {
    const id = uiState.openWindow({ type: 'actor-sheet', title: 'Solo' });
    uiState.closeTab(id);
    expect(uiState.openWindows.size).toBe(0);
    expect(uiState.windowGroups.size).toBe(0);
  });

  it('removes only the tab (not the group) when a sibling tab remains', () => {
    const idA = uiState.openWindow({ type: 'actor-sheet', title: 'A' });
    const idB = uiState.openWindow({ type: 'settings', title: 'B' });

    // Merge B into A's group so they share one frame.
    const groupAId = [...uiState.windowGroups.keys()][0];
    const groupBId = [...uiState.windowGroups.keys()][1];
    uiState.mergeGroups(groupBId, groupAId);

    // Close one tab.
    uiState.closeTab(idA);

    expect(uiState.openWindows.size).toBe(1);
    expect(uiState.windowGroups.size).toBe(1);
    const group = [...uiState.windowGroups.values()][0];
    expect(group.tabs).toContain(idB);
  });

  it('is a no-op for an unknown window ID (does not throw)', () => {
    expect(() => uiState.closeTab('nonexistent-window')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// bringGroupToFront()
// ---------------------------------------------------------------------------

describe('bringGroupToFront()', () => {
  it("raises the target group's zIndex above all other groups", () => {
    uiState.openWindow({ type: 'actor-sheet', title: 'A' });
    uiState.openWindow({ type: 'settings', title: 'B' });
    const [groupAId, groupBId] = [...uiState.windowGroups.keys()];

    uiState.bringGroupToFront(groupAId);

    const groupA = uiState.windowGroups.get(groupAId)!;
    const groupB = uiState.windowGroups.get(groupBId)!;
    expect(groupA.zIndex).toBeGreaterThan(groupB.zIndex);
  });
});

// ---------------------------------------------------------------------------
// mergeGroups()
// ---------------------------------------------------------------------------

describe('mergeGroups()', () => {
  it('merges all tabs from source into target and destroys the source group', () => {
    const idA = uiState.openWindow({ type: 'actor-sheet', title: 'A' });
    const idB = uiState.openWindow({ type: 'settings', title: 'B' });
    const [groupAId, groupBId] = [...uiState.windowGroups.keys()];

    uiState.mergeGroups(groupBId, groupAId);

    expect(uiState.windowGroups.size).toBe(1);
    const remaining = [...uiState.windowGroups.values()][0];
    expect(remaining.tabs).toContain(idA);
    expect(remaining.tabs).toContain(idB);
    expect(remaining.tabs).toHaveLength(2);
    expect(uiState.windowGroups.has(groupBId)).toBe(false);
  });

  it('is a no-op when source and target are the same group', () => {
    const id = uiState.openWindow({ type: 'actor-sheet', title: 'Solo' });
    const groupId = [...uiState.windowGroups.keys()][0];

    uiState.mergeGroups(groupId, groupId);

    expect(uiState.windowGroups.size).toBe(1);
    const group = uiState.windowGroups.get(groupId)!;
    expect(group.tabs).toHaveLength(1);
    expect(group.tabs[0]).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// detachTab()
// ---------------------------------------------------------------------------

describe('detachTab()', () => {
  it('splits a merged group back into two groups at the specified position', () => {
    const idA = uiState.openWindow({ type: 'actor-sheet', title: 'A' });
    const idB = uiState.openWindow({ type: 'settings', title: 'B' });
    const [groupAId, groupBId] = [...uiState.windowGroups.keys()];

    // Merge B into A.
    uiState.mergeGroups(groupBId, groupAId);
    expect(uiState.windowGroups.size).toBe(1);

    // Detach B to a new position.
    uiState.detachTab(idB, 300, 400);

    expect(uiState.windowGroups.size).toBe(2);

    // Find the group that contains idB.
    const detachedGroup = [...uiState.windowGroups.values()].find((g) =>
      g.tabs.includes(idB),
    )!;
    expect(detachedGroup.x).toBe(300);
    expect(detachedGroup.y).toBe(400);
    expect(detachedGroup.tabs).toHaveLength(1);

    // The original group should still have idA.
    const originalGroup = [...uiState.windowGroups.values()].find((g) =>
      g.tabs.includes(idA),
    )!;
    expect(originalGroup).toBeDefined();
  });

  it('creates a new group and destroys the source group when detaching the only tab', () => {
    const id = uiState.openWindow({ type: 'actor-sheet', title: 'Solo' });
    const originalGroupId = [...uiState.windowGroups.keys()][0];

    const newGroupId = uiState.detachTab(id, 100, 200);

    expect(newGroupId).not.toBeNull();
    expect(uiState.windowGroups.has(originalGroupId)).toBe(false);
    expect(uiState.windowGroups.has(newGroupId!)).toBe(true);
    expect(uiState.windowGroups.size).toBe(1);
  });

  it('returns null for an unknown window ID without throwing', () => {
    const result = uiState.detachTab('nonexistent', 0, 0);
    expect(result).toBeNull();
  });
});
