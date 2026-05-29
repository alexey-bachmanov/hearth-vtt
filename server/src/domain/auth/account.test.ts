import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  validatePassword,
  createAccount,
  verifyAccountPassword,
  bindSeat,
  unbindSeat,
  AccountError,
} from './account.js';
import { InMemoryBackend } from '../../storage/in-memory-storage.js';
import { Storage } from '../../storage/storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): Storage {
  return new Storage(new InMemoryBackend());
}

async function makeStorageWithAccount(
  username = 'testuser',
  password = 'testpassword',
): Promise<{ storage: Storage; accountId: string }> {
  const storage = makeStorage();
  const account = await createAccount(username, password, storage);
  return { storage, accountId: account.id };
}

// ---------------------------------------------------------------------------
// validateUsername
// ---------------------------------------------------------------------------

describe('validateUsername', () => {
  it('accepts valid usernames', () => {
    expect(validateUsername('alice')).toBeNull();
    expect(validateUsername('Bob123')).toBeNull();
    expect(validateUsername('ab')).toBeNull(); // min length 2
    expect(validateUsername('a'.repeat(32))).toBeNull(); // max length 32
    expect(validateUsername('user_name')).toBeNull();
    expect(validateUsername('user.name')).toBeNull();
    expect(validateUsername('user-name')).toBeNull();
  });

  it('rejects usernames that are too short', () => {
    expect(validateUsername('a')).not.toBeNull();
  });

  it('rejects usernames that are too long', () => {
    expect(validateUsername('a'.repeat(33))).not.toBeNull();
  });

  it('rejects usernames with invalid characters', () => {
    expect(validateUsername('user name')).not.toBeNull(); // space
    expect(validateUsername('user@name')).not.toBeNull(); // @
    expect(validateUsername('user!name')).not.toBeNull(); // !
    expect(validateUsername('')).not.toBeNull(); // empty
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('accepts valid passwords', () => {
    expect(validatePassword('password')).toBeNull(); // exactly 8 chars
    expect(validatePassword('a long password with spaces')).toBeNull();
  });

  it('rejects passwords that are too short', () => {
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('1234567')).not.toBeNull(); // 7 chars
  });

  it('rejects passwords that are too long', () => {
    expect(validatePassword('a'.repeat(1025))).not.toBeNull();
  });

  it('accepts passwords at the byte boundary', () => {
    expect(validatePassword('a'.repeat(1024))).toBeNull(); // exactly MAX
  });
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

describe('createAccount', () => {
  it('creates a PlayerAccount with hashed password', async () => {
    const storage = makeStorage();
    const account = await createAccount('alice', 'securepassword', storage);

    expect(account.username).toBe('alice');
    expect(account.mustChangePassword).toBe(false);
    expect(account.passwordHash).not.toBe('securepassword');
    expect(account.passwordHash).toContain(':'); // salt:hash format
    expect(account.id).toBeTruthy();
    expect(account.lastLoginAt).toBeNull();
  });

  it('throws USERNAME_INVALID for bad username', async () => {
    const storage = makeStorage();
    await expect(
      createAccount('a', 'securepassword', storage),
    ).rejects.toMatchObject({
      code: 'USERNAME_INVALID',
    });
  });

  it('throws PASSWORD_TOO_SHORT for short password', async () => {
    const storage = makeStorage();
    await expect(
      createAccount('alice', 'short', storage),
    ).rejects.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    });
  });

  it('throws PASSWORD_TOO_LONG for oversized password', async () => {
    const storage = makeStorage();
    await expect(
      createAccount('alice', 'a'.repeat(1025), storage),
    ).rejects.toMatchObject({
      code: 'PASSWORD_TOO_LONG',
    });
  });

  it('throws USERNAME_TAKEN for duplicate username', async () => {
    const storage = makeStorage();
    await createAccount('alice', 'securepassword', storage);
    await expect(
      createAccount('alice', 'anotherpassword', storage),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });
  });

  it('throws USERNAME_TAKEN using the exact same casing', async () => {
    const storage = makeStorage();
    await createAccount('Alice', 'securepassword', storage);
    // Same casing → taken; different casing → allowed (case-sensitive usernames)
    await expect(
      createAccount('Alice', 'anotherpassword', storage),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });
    // Different casing is a different username
    await expect(
      createAccount('alice', 'anotherpassword', storage),
    ).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// verifyAccountPassword
// ---------------------------------------------------------------------------

describe('verifyAccountPassword', () => {
  it('returns true for the correct password', async () => {
    const storage = makeStorage();
    const account = await createAccount('alice', 'securepassword', storage);
    await expect(
      verifyAccountPassword(account, 'securepassword'),
    ).resolves.toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const storage = makeStorage();
    const account = await createAccount('alice', 'securepassword', storage);
    await expect(verifyAccountPassword(account, 'wrongpassword')).resolves.toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// bindSeat / unbindSeat
// ---------------------------------------------------------------------------

describe('bindSeat', () => {
  it('binds a seat to an account', async () => {
    const { storage, accountId } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Alice',
      role: 'player',
    });

    const updated = await bindSeat(accountId, campaign.id, seat.id, storage);
    expect(updated.accountId).toBe(accountId);
  });

  it('is idempotent when binding same account twice', async () => {
    const { storage, accountId } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Alice',
      role: 'player',
    });

    await bindSeat(accountId, campaign.id, seat.id, storage);
    const updated = await bindSeat(accountId, campaign.id, seat.id, storage);
    expect(updated.accountId).toBe(accountId);
  });

  it('throws SEAT_ALREADY_BOUND if seat belongs to another account', async () => {
    // Need to use same storage for both accounts
    const storage2 = makeStorage();
    const acct1 = await createAccount('alice', 'securepassword', storage2);
    const acct2 = await createAccount('bob', 'securepassword', storage2);

    const campaign = await storage2.createCampaign('Test');
    const seat = await storage2.createSeat({
      campaignId: campaign.id,
      displayName: 'Alice',
      role: 'player',
    });

    await bindSeat(acct1.id, campaign.id, seat.id, storage2);
    await expect(
      bindSeat(acct2.id, campaign.id, seat.id, storage2),
    ).rejects.toMatchObject({
      code: 'SEAT_ALREADY_BOUND',
    });
  });

  it('throws SEAT_NOT_FOUND for non-existent seat', async () => {
    const { storage, accountId } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');

    await expect(
      bindSeat(accountId, campaign.id, 'nonexistent-seat-id', storage),
    ).rejects.toMatchObject({ code: 'SEAT_NOT_FOUND' });
  });
});

describe('unbindSeat', () => {
  it('unbinds a bound seat', async () => {
    const { storage, accountId } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Alice',
      role: 'player',
    });

    await bindSeat(accountId, campaign.id, seat.id, storage);
    const updated = await unbindSeat(campaign.id, seat.id, storage);
    expect(updated.accountId).toBeNull();
  });

  it('is idempotent on an already-unbound seat', async () => {
    const { storage } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');
    const seat = await storage.createSeat({
      campaignId: campaign.id,
      displayName: 'Alice',
      role: 'player',
    });

    const updated = await unbindSeat(campaign.id, seat.id, storage);
    expect(updated.accountId).toBeNull();
  });

  it('throws SEAT_NOT_FOUND for non-existent seat', async () => {
    const { storage } = await makeStorageWithAccount();
    const campaign = await storage.createCampaign('Test');

    await expect(
      unbindSeat(campaign.id, 'nonexistent-seat-id', storage),
    ).rejects.toMatchObject({ code: 'SEAT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// AccountError
// ---------------------------------------------------------------------------

describe('AccountError', () => {
  it('is an instance of Error', () => {
    const err = new AccountError('USERNAME_TAKEN', 'taken');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AccountError');
    expect(err.code).toBe('USERNAME_TAKEN');
    expect(err.message).toBe('taken');
  });
});
