// Thin HTTP client for the TournamentOS Node API.
// Uses REACT_APP_BACKEND_URL. Token is read from localStorage.
// All methods return { data, error }. On error, error is { code, message, details? }.

const BASE_URL = process.env.REACT_APP_BACKEND_URL || '';
const TOKEN_KEY = 'tos-token';

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function request(method, path, { body, query, headers = {} } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const token = getToken();
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  try {
    const res = await fetch(url.toString(), init);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json() : await res.text();
    if (!res.ok) return { data: null, error: payload?.error || { code: 'HTTP_' + res.status, message: res.statusText } };
    return { data: payload, error: null };
  } catch (err) {
    return { data: null, error: { code: 'NETWORK', message: err.message } };
  }
}

export const api = {
  // auth
  register: (body) => request('POST', '/api/auth/register', { body }),
  login: (body) => request('POST', '/api/auth/login', { body }),
  loginWithGoogle: (idToken) => request('POST', '/api/auth/google', { body: { idToken } }),
  me: () => request('GET', '/api/auth/me'),
  logout: () => request('POST', '/api/auth/logout'),

  // profiles
  getMyProfile: () => request('GET', '/api/profiles/me'),
  upsertMyProfile: (body) => request('PUT', '/api/profiles/me', { body }),

  // clubs
  createClub: (body) => request('POST', '/api/clubs', { body }),
  listClubs: (query) => request('GET', '/api/clubs', { query }),

  // applications
  createApplication: (body) => request('POST', '/api/applications', { body }),
  listApplications: (query) => request('GET', '/api/applications', { query }),
  getApplication: (id) => request('GET', `/api/applications/${id}`),
  updateApplication: (id, body) => request('PATCH', `/api/applications/${id}`, { body }),
  submitApplication: (id) => request('POST', `/api/applications/${id}/submit`),

  // review
  assignReviewer: (id, reviewerId) => request('POST', `/api/reviews/${id}/assign`, { body: { reviewerId } }),
  startReview: (id) => request('POST', `/api/reviews/${id}/start`),
  decide: (id, body) => request('POST', `/api/reviews/${id}/decision`, { body }),
  bulkDecide: (body) => request('POST', `/api/reviews/bulk/decision`, { body }),
  reopen: (id, reason) => request('POST', `/api/reviews/${id}/reopen`, { body: { reason } }),

  // queue
  queueBoard: (query) => request('GET', '/api/queue', { query }),
  queueSla: () => request('GET', '/api/queue/sla'),
  queueWorkload: () => request('GET', '/api/queue/workload'),

  // appeals
  fileAppeal: (body) => request('POST', '/api/appeals', { body }),
  openAppeals: () => request('GET', '/api/appeals/open'),
  decideAppeal: (id, body) => request('POST', `/api/appeals/${id}/decision`, { body }),

  // reports
  reportSummary: () => request('GET', '/api/reports/summary'),
  exportApprovedXlsx: () => `${BASE_URL}/api/reports/approved.xlsx`,
  exportApplicationPdf: (id) => `${BASE_URL}/api/reports/applications/${id}.pdf`,

  // public
  publicTournaments: () => request('GET', '/api/public/tournaments'),
  publicParticipants: (query) => request('GET', '/api/public/participants', { query }),
  publicClubs: (query) => request('GET', '/api/public/clubs', { query }),
  publicCirculars: (query) => request('GET', '/api/public/circulars', { query }),

  // circulars (admin)
  listCirculars: (query) => request('GET', '/api/circulars', { query }),
  createCircular: (body) => request('POST', '/api/circulars', { body }),
  updateCircular: (id, body) => request('PATCH', `/api/circulars/${id}`, { body }),
  deleteCircular: (id) => request('DELETE', `/api/circulars/${id}`),

  // audit
  verifyAudit: () => request('GET', '/api/audit/verify'),
  auditForEntity: (type, id) => request('GET', `/api/audit/entity/${type}/${id}`),
};

/** Check whether the API is reachable (for wire-it-up detection). */
export async function isApiLive() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true && body?.env !== undefined;
  } catch {
    return false;
  }
}

export default api;
