import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('application applicant listing scope', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('queries by the applicant profile id instead of filtering all applications in memory', async () => {
    const findByUserId = vi.fn().mockResolvedValue({ id: 'profile-1', user_id: 'user-1' });
    const query = vi.fn().mockResolvedValue([
      {
        id: 'application-1',
        profile_id: 'profile-1',
        first_name: 'Asha',
        last_name: 'Rao',
      },
    ]);

    const repositoriesMock = {
      applications: { query },
      profiles: { findByUserId },
      tournaments: {},
      statusEvents: {},
      reviewers: {},
      clubs: {},
      documents: {},
    };
    const repositoriesPath = require.resolve('../src/repositories.js');
    const servicePath = require.resolve('../src/services/application.service.js');
    const previousRepositoriesCache = require.cache[repositoriesPath];
    const previousServiceCache = require.cache[servicePath];
    require.cache[repositoriesPath] = {
      id: repositoriesPath,
      filename: repositoriesPath,
      loaded: true,
      exports: repositoriesMock,
    };
    delete require.cache[servicePath];

    try {
      const service = require('../src/services/application.service.js');
      const rows = await service.listForMe({ id: 'user-1', role: 'applicant' }, { status: 'all', limit: 20 });

      expect(findByUserId).toHaveBeenCalledWith('user-1');
      expect(query).toHaveBeenCalledWith({ status: 'all', limit: 20, profileId: 'profile-1' });
      expect(rows).toHaveLength(1);
      expect(rows[0].profile_id).toBe('profile-1');
    } finally {
      if (previousRepositoriesCache) require.cache[repositoriesPath] = previousRepositoriesCache;
      else delete require.cache[repositoriesPath];
      if (previousServiceCache) require.cache[servicePath] = previousServiceCache;
      else delete require.cache[servicePath];
    }
  });
});
