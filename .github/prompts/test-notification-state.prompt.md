---
agent: agent
description: Write unit tests for client/src/state/notifications.svelte.ts
---

# Task: Write NotificationState Unit Tests

Create `client/src/state/notifications.svelte.test.ts` with full unit test coverage for the `NotificationState` class.

## Reference materials — read these first

1. **Source under test** (read the full file):
   `client/src/state/notifications.svelte.ts`

2. **Reference component test** (for vitest import style and fake-timer pattern):
   `client/src/ui/notifications/NotificationCard.test.ts`

## Key facts about the module

- `NotificationState` is a private class (not exported).
- The file exports a **singleton**: `export const notificationState = new NotificationState()`
- Tests must import and use the **singleton**, calling `notificationState.reset()` in `beforeEach` to ensure isolation.
- `notifications` is a `$state<Notification[]>([])` array — in vitest (with `@sveltejs/vite-plugin-svelte` transforming `.svelte.ts` files), reading `.notifications` returns the current array synchronously.
- **No DOM needed** — do NOT import `render` or use `@testing-library/svelte`. This is pure TypeScript logic.

## Imports

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationState } from './notifications.svelte';
```

## Test cases to implement

### Reset between tests

In `beforeEach`, call `notificationState.reset()` — verifies the array is empty and `ephemeralTimeout` is restored to 5000.

### `push()`

- Adds a notification to `notifications`
- Returned ID starts with `'notif-'`
- The notification has the correct `type`, `kind`, and `message`
- The notification has a numeric `timestamp`
- `actions` field is `undefined` when not provided

### `dismiss(id)`

- Removes the notification with the matching ID
- Leaves other notifications untouched
- Is a no-op when the ID does not exist

### Convenience helpers

- `info(message)` → adds notification with `kind: 'info'` and `type: 'ephemeral'`
- `success(message)` → `kind: 'success'`, `type: 'ephemeral'`
- `warning(message)` → `kind: 'warning'`, `type: 'persistent'`
- `error(message)` → `kind: 'error'`, `type: 'persistent'`
- `prompt(kind, message, actions)` → `type: 'persistent'`, actions array attached

### Ephemeral auto-dismiss (uses fake timers)

- After `push('ephemeral', ...)`, the notification is present immediately
- After `vi.advanceTimersByTime(5000)` (the default `ephemeralTimeout`), the notification is gone
- After `vi.advanceTimersByTime(4999)`, it is still present
- Persistent notifications are NOT auto-dismissed after 5000 ms

### Custom `ephemeralTimeout`

- `setEphemeralTimeout(1000)` followed by an ephemeral `push()` — advances by 1000 ms removes it; advancing only 999 ms does not

### `dismissAll()` / `clear()`

- Both remove all notifications regardless of type
- After `dismissAll()`, `notifications` is `[]`

### `dismissAllEphemeral()`

- Removes only ephemeral notifications, keeps persistent ones

## Fake timer setup

Wrap only the timer-sensitive tests in a describe block with:

```ts
describe('ephemeral auto-dismiss', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('...', () => { ... });
});
```

Do NOT use fake timers globally — the `reset()` call in the outer `beforeEach` is synchronous and does not need them.

## Definition of done

- File created at `client/src/state/notifications.svelte.test.ts`
- `cd client && npx vitest run` exits 0 with all new tests passing
- No changes to any source files — test-only addition
