import { afterEach, expect, it, vi } from 'vitest';
import { getDb, getUserByOpenId, upsertUser } from './db';

afterEach(() => vi.unstubAllEnvs());

it('refuses auth and payment database access when DATABASE_URL is absent', async () => {
  vi.stubEnv('DATABASE_URL', '');
  await expect(getDb()).rejects.toThrow('DATABASE_URL is required for auth and payments');
  await expect(getUserByOpenId('any-user')).rejects.toThrow('DATABASE_URL is required for auth and payments');
  await expect(upsertUser({ openId: 'any-user' })).rejects.toThrow('DATABASE_URL is required for auth and payments');
});
