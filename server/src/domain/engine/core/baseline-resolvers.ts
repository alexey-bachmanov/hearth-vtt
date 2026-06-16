/**
 * Baseline resolver map — Phase 6C (throwaway v0.1).
 *
 * Ports the validation + event-construction logic from PlaceholderEngine's
 * `validateTokenMove`, `validateChatSend`, and `validateDiceRoll` into the
 * resolver contract defined in types.ts.
 *
 * Resolvers throw on invalid/unauthorised input; the engine catches these and
 * returns `{ accepted: false, reason }` to the caller.
 *
 * NOTE: `dice.roll` uses `formula` as its own PRNG seed. This is intentionally
 * approximate for v0.1 throwaway code — a proper per-dispatch seed derived from
 * campaignId + seq is deferred to the real engine.
 */

import type { Position } from '@hearth-vtt/shared';
import type { ActionBinding, ResolverIntent, ResolverResult } from './types.js';

// ─── Resolver args shape ─────────────────────────────────────────────────────

/**
 * Fields injected by the engine into every resolver args object.
 * Spread alongside the action payload by EngineV01.dispatchInternal.
 */
interface SeatContext {
  seatId: string;
  isGm: boolean;
  seatDisplayName: string;
}

// ─── token.move ──────────────────────────────────────────────────────────────

const tokenMoveResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    // Validate args shape
    if (!args || typeof args !== 'object') {
      throw new Error('token.move requires an object payload');
    }

    const { seatId, isGm } = args as SeatContext;

    const { tokenId, position } = args as {
      tokenId?: unknown;
      position?: unknown;
    } & SeatContext;

    if (typeof tokenId !== 'string') {
      throw new Error('token.move requires { tokenId: string }');
    }
    if (
      !position ||
      typeof position !== 'object' ||
      typeof (position as { x?: unknown }).x !== 'number' ||
      typeof (position as { y?: unknown }).y !== 'number'
    ) {
      throw new Error(
        'token.move requires { position: { x: number, y: number } }',
      );
    }

    const newPos: Position = {
      x: (position as { x: number }).x,
      y: (position as { y: number }).y,
    };

    // State lookup
    const token = helpers.getToken(tokenId);
    if (!token) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    // Authorization: GM bypasses; player must control the actor
    if (!isGm) {
      const actor = helpers.getActor(token.actorId);
      if (actor?.seatPermissions[seatId] !== 'control') {
        throw new Error('Not authorized to move this token');
      }
    }

    const from: Position = { ...token.position };

    const intents: ResolverIntent[] = [
      { kind: 'token.move', tokenId, from, to: newPos },
    ];

    return { intents };
  },
};

// ─── chat.send ───────────────────────────────────────────────────────────────

const chatSendResolver: ActionBinding = {
  resolver(args: unknown, _helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('chat.send requires an object payload');
    }

    const { seatDisplayName } = args as SeatContext;
    const { text } = args as { text?: unknown } & SeatContext;

    if (typeof text !== 'string') {
      throw new Error('chat.send requires { text: string }');
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new Error('Chat text must not be empty');
    }
    if (trimmed.length > 2000) {
      throw new Error('Chat text must be at most 2000 characters');
    }

    return {
      intents: [
        { kind: 'chat.send', text: trimmed, displayName: seatDisplayName },
      ],
    };
  },
};

// ─── dice.roll ───────────────────────────────────────────────────────────────

const diceRollResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('dice.roll requires an object payload');
    }

    const { seatDisplayName } = args as SeatContext;
    const { formula } = args as { formula?: unknown } & SeatContext;

    if (typeof formula !== 'string') {
      throw new Error('dice.roll requires { formula: string }');
    }

    // NOTE v0.1: formula is used as its own seed. A proper per-dispatch seed
    // (campaignId + seq) is deferred to the real engine.
    const result = helpers.rollDice(formula, formula);
    if (!result.ok) {
      throw new Error(result.reason);
    }

    return {
      intents: [
        {
          kind: 'dice.result',
          formula,
          rolls: result.rolls,
          total: result.total,
          displayName: seatDisplayName,
        },
      ],
    };
  },
};

// ─── token.create ────────────────────────────────────────────────────────────

const tokenCreateResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('token.create requires an object payload');
    }

    const {
      isGm,
      tokenId,
      actorId,
      sceneId,
      position,
      name,
      imageUrl,
      hidden,
      data,
    } = args as Record<string, unknown> & SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can create tokens');
    }
    if (typeof tokenId !== 'string') {
      throw new Error('token.create requires { tokenId: string }');
    }
    if (helpers.getToken(tokenId)) {
      throw new Error(`Token already exists: ${tokenId}`);
    }
    if (typeof actorId !== 'string') {
      throw new Error('token.create requires { actorId: string }');
    }
    if (!helpers.getActor(actorId)) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    if (typeof sceneId !== 'string') {
      throw new Error('token.create requires { sceneId: string }');
    }
    if (!helpers.getScene(sceneId)) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    if (
      !position ||
      typeof position !== 'object' ||
      typeof (position as Record<string, unknown>).x !== 'number' ||
      typeof (position as Record<string, unknown>).y !== 'number'
    ) {
      throw new Error(
        'token.create requires { position: { x: number, y: number } }',
      );
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error('token.create requires { data: Record<string, unknown> }');
    }

    const pos: Position = {
      x: (position as { x: number }).x,
      y: (position as { y: number }).y,
    };

    const intent: ResolverIntent = {
      kind: 'token.create',
      tokenId,
      actorId,
      sceneId,
      position: pos,
      data: data as Record<string, unknown>,
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof imageUrl === 'string' ? { imageUrl } : {}),
      ...(hidden === true ? { hidden: true } : {}),
    };

    return { intents: [intent] };
  },
};

// ─── token.delete ────────────────────────────────────────────────────────────

const tokenDeleteResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('token.delete requires an object payload');
    }

    const { isGm, tokenId } = args as Record<string, unknown> & SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can delete tokens');
    }
    if (typeof tokenId !== 'string') {
      throw new Error('token.delete requires { tokenId: string }');
    }
    if (!helpers.getToken(tokenId)) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    return { intents: [{ kind: 'token.delete', tokenId }] };
  },
};

// ─── actor.create ────────────────────────────────────────────────────────────

const actorCreateResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('actor.create requires an object payload');
    }

    const { isGm, actorId, name, data, seatPermissions } = args as Record<
      string,
      unknown
    > &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can create actors');
    }
    if (typeof actorId !== 'string') {
      throw new Error('actor.create requires { actorId: string }');
    }
    if (helpers.getActor(actorId)) {
      throw new Error(`Actor already exists: ${actorId}`);
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('actor.create requires { name: string }');
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error('actor.create requires { data: Record<string, unknown> }');
    }

    const intent: ResolverIntent = {
      kind: 'actor.create',
      actorId,
      name: name.trim(),
      data: data as Record<string, unknown>,
      ...(typeof seatPermissions === 'object' && seatPermissions !== null
        ? { seatPermissions: seatPermissions as Record<string, 'control' | 'read'> }
        : {}),
    };

    return { intents: [intent] };
  },
};

// ─── actor.delete ────────────────────────────────────────────────────────────

const actorDeleteResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('actor.delete requires an object payload');
    }

    const { isGm, actorId } = args as Record<string, unknown> & SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can delete actors');
    }
    if (typeof actorId !== 'string') {
      throw new Error('actor.delete requires { actorId: string }');
    }
    if (!helpers.getActor(actorId)) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    return { intents: [{ kind: 'actor.delete', actorId }] };
  },
};

// ─── token.linkToActor ───────────────────────────────────────────────────────

const tokenLinkToActorResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('token.linkToActor requires an object payload');
    }

    const { isGm, tokenId, actorId } = args as Record<string, unknown> &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can link tokens to actors');
    }
    if (typeof tokenId !== 'string') {
      throw new Error('token.linkToActor requires { tokenId: string }');
    }
    if (!helpers.getToken(tokenId)) {
      throw new Error(`Token not found: ${tokenId}`);
    }
    if (typeof actorId !== 'string') {
      throw new Error('token.linkToActor requires { actorId: string }');
    }
    if (!helpers.getActor(actorId)) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    return { intents: [{ kind: 'token.linkToActor', tokenId, actorId }] };
  },
};

// ─── actor.linkSeat ──────────────────────────────────────────────────────────

const actorLinkSeatResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('actor.linkSeat requires an object payload');
    }

    const { isGm, actorId, seatId, permission } = args as Record<
      string,
      unknown
    > &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can link seats to actors');
    }
    if (typeof actorId !== 'string') {
      throw new Error('actor.linkSeat requires { actorId: string }');
    }
    if (!helpers.getActor(actorId)) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    if (typeof seatId !== 'string') {
      throw new Error('actor.linkSeat requires { seatId: string }');
    }
    if (permission !== 'control' && permission !== 'read') {
      throw new Error(
        'actor.linkSeat requires { permission: "control" | "read" }',
      );
    }

    return {
      intents: [{ kind: 'actor.linkSeat', actorId, seatId, permission }],
    };
  },
};

// ─── scene.create ────────────────────────────────────────────────────────────

const sceneCreateResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('scene.create requires an object payload');
    }

    const { isGm, sceneId, name, data } = args as Record<string, unknown> &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can create scenes');
    }
    if (typeof sceneId !== 'string') {
      throw new Error('scene.create requires { sceneId: string }');
    }
    if (helpers.getScene(sceneId)) {
      throw new Error(`Scene already exists: ${sceneId}`);
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('scene.create requires { name: string }');
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error('scene.create requires { data: Record<string, unknown> }');
    }

    const intent: ResolverIntent = {
      kind: 'scene.create',
      sceneId,
      name: name.trim(),
      data: data as Record<string, unknown>,
    };

    return { intents: [intent] };
  },
};

// ─── scene.delete (cascade) ──────────────────────────────────────────────────

const sceneDeleteResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('scene.delete requires an object payload');
    }

    const { isGm, sceneId } = args as Record<string, unknown> & SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can delete scenes');
    }
    if (typeof sceneId !== 'string') {
      throw new Error('scene.delete requires { sceneId: string }');
    }
    if (!helpers.getScene(sceneId)) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // Cascade: produce token.delete intents for every token in this scene,
    // then the scene.delete intent itself.
    const tokensInScene = helpers.tokensInRadius(sceneId, 0, 0, 0);
    const intents: ResolverIntent[] = tokensInScene.map((token) => ({
      kind: 'token.delete' as const,
      tokenId: token.id,
    }));
    intents.push({ kind: 'scene.delete', sceneId });

    return { intents };
  },
};

// ─── scene.setActive ─────────────────────────────────────────────────────────

const sceneSetActiveResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('scene.setActive requires an object payload');
    }

    const { isGm, sceneId } = args as Record<string, unknown> & SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can set the active scene');
    }
    if (typeof sceneId !== 'string') {
      throw new Error('scene.setActive requires { sceneId: string }');
    }
    if (!helpers.getScene(sceneId)) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    return { intents: [{ kind: 'scene.setActive', sceneId }] };
  },
};

// ─── actor.replaceData ───────────────────────────────────────────────────────

const actorReplaceDataResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('actor.replaceData requires an object payload');
    }

    const { isGm, actorId, data } = args as Record<string, unknown> &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can replace actor data');
    }
    if (typeof actorId !== 'string') {
      throw new Error('actor.replaceData requires { actorId: string }');
    }
    if (!helpers.getActor(actorId)) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error(
        'actor.replaceData requires { data: Record<string, unknown> }',
      );
    }

    return {
      intents: [
        {
          kind: 'actor.replaceData',
          actorId,
          data: data as Record<string, unknown>,
        },
      ],
    };
  },
};

// ─── token.replaceData ───────────────────────────────────────────────────────

const tokenReplaceDataResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('token.replaceData requires an object payload');
    }

    const { isGm, tokenId, data } = args as Record<string, unknown> &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can replace token data');
    }
    if (typeof tokenId !== 'string') {
      throw new Error('token.replaceData requires { tokenId: string }');
    }
    if (!helpers.getToken(tokenId)) {
      throw new Error(`Token not found: ${tokenId}`);
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error(
        'token.replaceData requires { data: Record<string, unknown> }',
      );
    }

    return {
      intents: [
        {
          kind: 'token.replaceData',
          tokenId,
          data: data as Record<string, unknown>,
        },
      ],
    };
  },
};

// ─── scene.replaceData ───────────────────────────────────────────────────────

const sceneReplaceDataResolver: ActionBinding = {
  resolver(args: unknown, helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('scene.replaceData requires an object payload');
    }

    const { isGm, sceneId, data } = args as Record<string, unknown> &
      SeatContext;

    if (!isGm) {
      throw new Error('Only GMs can replace scene data');
    }
    if (typeof sceneId !== 'string') {
      throw new Error('scene.replaceData requires { sceneId: string }');
    }
    if (!helpers.getScene(sceneId)) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error(
        'scene.replaceData requires { data: Record<string, unknown> }',
      );
    }

    return {
      intents: [
        {
          kind: 'scene.replaceData',
          sceneId,
          data: data as Record<string, unknown>,
        },
      ],
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Baseline action bindings contributed by the engine itself.
 *
 * Registered first by EngineV01.open(); ruleset resolvers are appended after.
 */
export const baselineActions: Record<string, ActionBinding> = {
  'token.move': tokenMoveResolver,
  'chat.send': chatSendResolver,
  'dice.roll': diceRollResolver,
  'token.create': tokenCreateResolver,
  'token.delete': tokenDeleteResolver,
  'actor.create': actorCreateResolver,
  'actor.delete': actorDeleteResolver,
  'token.linkToActor': tokenLinkToActorResolver,
  'actor.linkSeat': actorLinkSeatResolver,
  'scene.create': sceneCreateResolver,
  'scene.delete': sceneDeleteResolver,
  'scene.setActive': sceneSetActiveResolver,
  'actor.replaceData': actorReplaceDataResolver,
  'token.replaceData': tokenReplaceDataResolver,
  'scene.replaceData': sceneReplaceDataResolver,
};
