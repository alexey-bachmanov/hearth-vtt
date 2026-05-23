/**
 * ChatLog accessibility tests.
 *
 * Verifies that the chat message input and send button have correct ARIA
 * labels so screen readers can announce their purpose.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { campaignState } from '../../state';
import ChatLog from './ChatLog.svelte';

beforeEach(() => {
  campaignState.clear();
});

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
