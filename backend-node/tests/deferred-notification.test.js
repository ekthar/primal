import { describe, expect, it, vi } from 'vitest';

describe('deferred notifications', () => {
  it('returns before notification record or provider work runs', async () => {
    vi.resetModules();
    const query = vi.fn(() => new Promise(() => {}));

    vi.doMock('../src/db.js', () => ({ query }));

    const { dispatchDeferred } = await import('../src/notifications.js');
    const result = dispatchDeferred({
      channels: ['email'],
      to: { email: 'slow@example.com' },
      template: 'auth.registered',
      payload: { email: 'slow@example.com', role: 'applicant' },
    });

    expect(result).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
