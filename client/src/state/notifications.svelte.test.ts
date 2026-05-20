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
    notificationState.push('ephemeral', 'info', 'hello');
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
    notificationState.push('ephemeral', 'info', 'test message');
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('returns an ID that starts with "notif-"', () => {
    const id = notificationState.push('ephemeral', 'info', 'test');
    expect(id).toMatch(/^notif-/);
  });

  it('stores the correct type, kind, and message', () => {
    notificationState.push('persistent', 'error', 'something broke');
    const notif = notificationState.notifications[0];
    expect(notif.type).toBe('persistent');
    expect(notif.kind).toBe('error');
    expect(notif.message).toBe('something broke');
  });

  it('stores a numeric timestamp', () => {
    notificationState.push('ephemeral', 'info', 'hello');
    const notif = notificationState.notifications[0];
    expect(typeof notif.timestamp).toBe('number');
  });

  it('leaves actions undefined when not provided', () => {
    notificationState.push('ephemeral', 'info', 'no actions');
    expect(notificationState.notifications[0].actions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dismiss()
// ---------------------------------------------------------------------------

describe('dismiss()', () => {
  it('removes the notification with the matching ID', () => {
    const id = notificationState.push('persistent', 'info', 'to remove');
    notificationState.dismiss(id);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('leaves other notifications untouched', () => {
    notificationState.push('persistent', 'info', 'keep me');
    const id = notificationState.push('persistent', 'info', 'remove me');
    notificationState.dismiss(id);
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].message).toBe('keep me');
  });

  it('is a no-op when the ID does not exist', () => {
    notificationState.push('persistent', 'info', 'stays');
    notificationState.dismiss('notif-nonexistent');
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

describe('convenience helpers', () => {
  it('info() adds an ephemeral info notification', () => {
    notificationState.info('info msg');
    const notif = notificationState.notifications[0];
    expect(notif.kind).toBe('info');
    expect(notif.type).toBe('ephemeral');
    expect(notif.message).toBe('info msg');
  });

  it('success() adds an ephemeral success notification', () => {
    notificationState.success('success msg');
    const notif = notificationState.notifications[0];
    expect(notif.kind).toBe('success');
    expect(notif.type).toBe('ephemeral');
  });

  it('warning() adds a persistent warning notification', () => {
    notificationState.warning('warning msg');
    const notif = notificationState.notifications[0];
    expect(notif.kind).toBe('warning');
    expect(notif.type).toBe('persistent');
  });

  it('error() adds a persistent error notification', () => {
    notificationState.error('error msg');
    const notif = notificationState.notifications[0];
    expect(notif.kind).toBe('error');
    expect(notif.type).toBe('persistent');
  });

  it('prompt() adds a persistent notification with actions', () => {
    const actions = [{ label: 'OK', onClick: vi.fn() }];
    notificationState.prompt('info', 'prompt msg', actions);
    const notif = notificationState.notifications[0];
    expect(notif.type).toBe('persistent');
    expect(notif.actions).toStrictEqual(actions);
    expect(notif.message).toBe('prompt msg');
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
    notificationState.push('ephemeral', 'info', 'hi');
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('notification is removed after the default 5000 ms timeout', () => {
    notificationState.push('ephemeral', 'info', 'auto-dismiss me');
    vi.advanceTimersByTime(5000);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('notification is still present at 4999 ms', () => {
    notificationState.push('ephemeral', 'info', 'not yet');
    vi.advanceTimersByTime(4999);
    expect(notificationState.notifications).toHaveLength(1);
  });

  it('persistent notifications are NOT auto-dismissed after 5000 ms', () => {
    notificationState.push('persistent', 'info', 'stays forever');
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
    notificationState.push('ephemeral', 'info', 'custom timeout');
    vi.advanceTimersByTime(1000);
    expect(notificationState.notifications).toHaveLength(0);
  });

  it('does not dismiss before the custom timeout elapses', () => {
    notificationState.setEphemeralTimeout(1000);
    notificationState.push('ephemeral', 'info', 'custom timeout');
    vi.advanceTimersByTime(999);
    expect(notificationState.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// dismissAll() and clear()
// ---------------------------------------------------------------------------

describe('dismissAll()', () => {
  it('removes all notifications', () => {
    notificationState.push('ephemeral', 'info', 'a');
    notificationState.push('persistent', 'error', 'b');
    notificationState.dismissAll();
    expect(notificationState.notifications).toHaveLength(0);
  });
});

describe('clear()', () => {
  it('removes all notifications (alias for dismissAll)', () => {
    notificationState.push('ephemeral', 'info', 'a');
    notificationState.push('persistent', 'warning', 'b');
    notificationState.clear();
    expect(notificationState.notifications).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dismissAllEphemeral()
// ---------------------------------------------------------------------------

describe('dismissAllEphemeral()', () => {
  it('removes only ephemeral notifications', () => {
    notificationState.push('ephemeral', 'info', 'gone');
    notificationState.push('persistent', 'error', 'stays');
    notificationState.dismissAllEphemeral();
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].type).toBe('persistent');
  });

  it('keeps all persistent notifications', () => {
    notificationState.push('persistent', 'warning', 'a');
    notificationState.push('persistent', 'error', 'b');
    notificationState.dismissAllEphemeral();
    expect(notificationState.notifications).toHaveLength(2);
  });
});
