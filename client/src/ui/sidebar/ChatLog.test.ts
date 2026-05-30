/**
 * ChatLog tests.
 *
 * Covers:
 *   - Accessibility: ARIA labels on input and button
 *   - Dispatch routing: plain text → chat.send; /roll → dice.roll; /r → dice.roll
 *   - Inline error: oversized chat text does not dispatch
 *   - Inline error: malformed /roll formula does not dispatch
 *   - Valid dispatch clears the input
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { campaignState } from '../../state';
import ChatLog from './ChatLog.svelte';

// ---------------------------------------------------------------------------
// Mock wsClient so we can intercept dispatch calls without a real WS connection
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn().mockReturnValue('req-mock');

vi.mock('../../api', () => ({
  wsClient: {
    dispatch: (actionType: string, payload: unknown) =>
      mockDispatch(actionType, payload),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeInInput(text: string) {
  const input = screen.getByRole('textbox', { name: /send a message/i });
  fireEvent.input(input, { target: { value: text } });
  return input;
}

function clickSend() {
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  campaignState.clear();
  mockDispatch.mockClear();
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ChatLog accessibility', () => {
  it('labels the message input "Send a message"', () => {
    render(ChatLog);
    expect(
      screen.getByRole('textbox', { name: /send a message/i }),
    ).toBeInTheDocument();
  });

  it('labels the send button "Send message"', () => {
    render(ChatLog);
    expect(
      screen.getByRole('button', { name: /send message/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dispatch routing
// ---------------------------------------------------------------------------

describe('ChatLog dispatch routing', () => {
  it('plain text dispatches chat.send with the trimmed text', () => {
    render(ChatLog);
    typeInInput('Hello, world!');
    clickSend();
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('chat.send', { text: 'Hello, world!' });
  });

  it('/roll formula dispatches dice.roll', () => {
    render(ChatLog);
    typeInInput('/roll 2d6+3');
    clickSend();
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', { formula: '2d6+3' });
  });

  it('/r shorthand dispatches dice.roll', () => {
    render(ChatLog);
    typeInInput('/r 4d8kh3');
    clickSend();
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('dice.roll', { formula: '4d8kh3' });
  });

  it('Enter key triggers the same dispatch as clicking Send', () => {
    render(ChatLog);
    const input = typeInInput('via enter key');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('chat.send', { text: 'via enter key' });
  });

  it('Shift+Enter does not dispatch', () => {
    render(ChatLog);
    const input = typeInInput('not sent');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('empty input does not dispatch', () => {
    render(ChatLog);
    typeInInput('   ');
    clickSend();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input clearing
// ---------------------------------------------------------------------------

describe('ChatLog input clearing', () => {
  it('clears input after a valid chat.send dispatch', async () => {
    render(ChatLog);
    const input = typeInInput('cleared after send') as HTMLInputElement;
    clickSend();
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('clears input after a valid dice.roll dispatch', async () => {
    render(ChatLog);
    const input = typeInInput('/roll 1d20') as HTMLInputElement;
    clickSend();
    await waitFor(() => expect(input.value).toBe(''));
  });
});

// ---------------------------------------------------------------------------
// Inline error cases
// ---------------------------------------------------------------------------

describe('ChatLog inline errors', () => {
  it('oversized text shows an error and does not dispatch', async () => {
    render(ChatLog);
    typeInInput('x'.repeat(2001));
    clickSend();
    expect(mockDispatch).not.toHaveBeenCalled();
    await screen.findByRole('alert');
  });

  it('oversized text does not clear the input', () => {
    render(ChatLog);
    const input = typeInInput('x'.repeat(2001)) as HTMLInputElement;
    clickSend();
    expect(input.value).toBe('x'.repeat(2001));
  });

  it('malformed /roll formula shows an error and does not dispatch', async () => {
    render(ChatLog);
    typeInInput('/roll not$valid');
    clickSend();
    expect(mockDispatch).not.toHaveBeenCalled();
    await screen.findByRole('alert');
  });

  it('malformed /roll formula does not clear the input', () => {
    render(ChatLog);
    const input = typeInInput('/roll not$valid') as HTMLInputElement;
    clickSend();
    expect(input.value).toBe('/roll not$valid');
  });

  it('error is cleared on a subsequent valid send', async () => {
    render(ChatLog);
    // Trigger an error first ($ is not in the pre-flight allowlist)
    typeInInput('/roll $invalid$');
    clickSend();
    await screen.findByRole('alert');

    // Now send valid text — error should disappear
    typeInInput('valid message');
    clickSend();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

