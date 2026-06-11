import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationState } from './notifications.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  notificationState.reset();
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('clears all notifications', () => {
    notificationState.push('client', 'ephemeral', 'info', 'hello');
    notificationState.reset();
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('restores ephemeralTimeout to 5000', () => {
    notificationState.setEphemeralTimeout(1000);
    notificationState.reset();
    expect(notificationState.ephemeralTimeout).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// push()
// ---------------------------------------------------------------------------

describe('push()', () => {
  it('adds a notification to the notifications array', () => {
    notificationState.push('client', 'ephemeral', 'info', 'test message');
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('returns an ID that starts with "notif-"', () => {
    const id = notificationState.push('client', 'ephemeral', 'info', 'test');
    expect(id).toMatch(/^notif-/);
  });

  it('stores origin, lifetime, kind, and message', () => {
    notificationState.push('server', 'persistent', 'error', 'something broke');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('server');
    expect(notif.lifetime).toBe('persistent');
    expect(notif.kind).toBe('error');
    expect(notif.message).toBe('something broke');
  });

  it('stores a numeric timestamp', () => {
    notificationState.push('client', 'ephemeral', 'info', 'hello');
    const notif = notificationState.notifications[0];
    expect(typeof notif.timestamp).toBe('number');
  });

  it('leaves actions undefined when not provided', () => {
    notificationState.push('client', 'ephemeral', 'info', 'no actions');
    expect(notificationState.notifications[0].actions).toBeUndefined();
  });

  it('stores promptId when provided', () => {
    notificationState.push(
      'server',
      'persistent',
      'info',
      'Roll for initiative',
      undefined,
      'prompt-abc',
    );
    expect(notificationState.notifications[0].promptId).toBe('prompt-abc');
  });
});

// ---------------------------------------------------------------------------
// dismiss()
// ---------------------------------------------------------------------------

describe('dismiss()', () => {
  it('removes the notification with the matching ID', () => {
    const id = notificationState.push(
      'client',
      'persistent',
      'info',
      'to remove',
    );
    notificationState.dismiss(id);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('leaves other notifications untouched', () => {
    notificationState.push('client', 'persistent', 'info', 'keep me');
    const id = notificationState.push(
      'client',
      'persistent',
      'info',
      'remove me',
    );
    notificationState.dismiss(id);
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].message).toBe('keep me');
  });

  it('is a no-op when the ID does not exist', () => {
    notificationState.push('client', 'persistent', 'info', 'stays');
    notificationState.dismiss('notif-nonexistent');
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2×2 dedicated methods
// ---------------------------------------------------------------------------

describe('2×2 dedicated methods', () => {
  it('toast() adds a (client, ephemeral) notification', () => {
    notificationState.toast('info', 'toast message');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.lifetime).toBe('ephemeral');
    expect(notif.kind).toBe('info');
    expect(notif.message).toBe('toast message');
  });

  it('feedEntry() adds a (server, ephemeral) notification', () => {
    notificationState.feedEntry('success', 'Goblin rolled 14');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('server');
    expect(notif.lifetime).toBe('ephemeral');
    expect(notif.kind).toBe('success');
    expect(notif.message).toBe('Goblin rolled 14');
  });

  it('persistent() adds a (client, persistent) notification', () => {
    notificationState.persistent('warning', 'Connection lost');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.lifetime).toBe('persistent');
    expect(notif.kind).toBe('warning');
  });

  it('persistent() accepts optional actions', () => {
    const actions = [{ label: 'Retry', onClick: vi.fn() }];
    notificationState.persistent('error', 'Failed to save', actions);
    expect(notificationState.notifications[0].actions).toStrictEqual(actions);
  });

  it('trackPrompt() adds a (server, persistent) notification with promptId', () => {
    notificationState.trackPrompt('prompt-xyz', 'Make a saving throw');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('server');
    expect(notif.lifetime).toBe('persistent');
    expect(notif.promptId).toBe('prompt-xyz');
    expect(notif.message).toBe('Make a saving throw');
  });

  it('trackPrompt() replaces an existing notification for the same promptId', () => {
    notificationState.trackPrompt('prompt-xyz', 'Old title');
    notificationState.trackPrompt('prompt-xyz', 'New title');
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].message).toBe('New title');
  });

  it('untrackPrompt() removes the notification with the matching promptId', () => {
    notificationState.trackPrompt('prompt-abc', 'Test');
    notificationState.trackPrompt('prompt-xyz', 'Another');
    notificationState.untrackPrompt('prompt-abc');
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].promptId).toBe('prompt-xyz');
  });

  it('untrackPrompt() is a no-op for non-existent promptId', () => {
    notificationState.trackPrompt('prompt-abc', 'Test');
    notificationState.untrackPrompt('prompt-nonexistent');
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

describe('convenience helpers', () => {
  it('info() adds a client ephemeral info notification', () => {
    notificationState.info('info msg');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.kind).toBe('info');
    expect(notif.lifetime).toBe('ephemeral');
    expect(notif.message).toBe('info msg');
  });

  it('success() adds a client ephemeral success notification', () => {
    notificationState.success('success msg');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.kind).toBe('success');
    expect(notif.lifetime).toBe('ephemeral');
  });

  it('warning() adds a client persistent warning notification', () => {
    notificationState.warning('warning msg');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.kind).toBe('warning');
    expect(notif.lifetime).toBe('persistent');
  });

  it('error() adds a client persistent error notification', () => {
    notificationState.error('error msg');
    const notif = notificationState.notifications[0];
    expect(notif.origin).toBe('client');
    expect(notif.kind).toBe('error');
    expect(notif.lifetime).toBe('persistent');
  });
});

// ---------------------------------------------------------------------------
// Ephemeral auto-dismiss (fake timers)
// ---------------------------------------------------------------------------

describe('ephemeral auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notification is present immediately after push', () => {
    notificationState.push('client', 'ephemeral', 'info', 'hi');
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('notification is removed after the default 5000 ms timeout', () => {
    notificationState.push('client', 'ephemeral', 'info', 'auto-dismiss me');
    vi.advanceTimersByTime(5000);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('notification is still present at 4999 ms', () => {
    notificationState.push('client', 'ephemeral', 'info', 'not yet');
    vi.advanceTimersByTime(4999);
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('persistent notifications are NOT auto-dismissed after 5000 ms', () => {
    notificationState.push('client', 'persistent', 'info', 'stays forever');
    vi.advanceTimersByTime(5000);
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Custom ephemeralTimeout
// ---------------------------------------------------------------------------

describe('custom ephemeralTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the custom timeout when dismissing ephemeral notifications', () => {
    notificationState.setEphemeralTimeout(1000);
    notificationState.push('client', 'ephemeral', 'info', 'custom timeout');
    vi.advanceTimersByTime(1000);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('does not dismiss before the custom timeout elapses', () => {
    notificationState.setEphemeralTimeout(1000);
    notificationState.push('client', 'ephemeral', 'info', 'custom timeout');
    vi.advanceTimersByTime(999);
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// dismissAll() and clear()
// ---------------------------------------------------------------------------

describe('dismissAll()', () => {
  it('removes all notifications', () => {
    notificationState.push('client', 'ephemeral', 'info', 'a');
    notificationState.push('client', 'persistent', 'error', 'b');
    notificationState.dismissAll();
    expect(notificationState.notifications).toHaveLength(0);
  });
});

describe('clear()', () => {
  it('removes all notifications (alias for dismissAll)', () => {
    notificationState.push('client', 'ephemeral', 'info', 'a');
    notificationState.push('client', 'persistent', 'warning', 'b');
    notificationState.clear();
    expect(notificationState.notifications).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dismissAllEphemeral()
// ---------------------------------------------------------------------------

describe('dismissAllEphemeral()', () => {
  it('removes only ephemeral notifications', () => {
    notificationState.push('server', 'ephemeral', 'info', 'gone');
    notificationState.push('client', 'persistent', 'error', 'stays');
    notificationState.dismissAllEphemeral();
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].lifetime).toBe('persistent');
  });

  it('keeps all persistent notifications', () => {
    notificationState.push('client', 'persistent', 'warning', 'a');
    notificationState.push('client', 'persistent', 'error', 'b');
    notificationState.dismissAllEphemeral();
    expect(notificationState.notifications).toHaveLength(2);
  });
});
