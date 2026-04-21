const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "";
const ACCESS_TOKEN_KEY = "tos-access-token";
const REFRESH_TOKEN_KEY = "tos-refresh-token";

export function setSession({ accessToken, refreshToken }) {
  if (typeof window === "undefined") return;
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const url = new URL(`${BASE_URL}/api/auth/refresh`, window.location.origin);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearSession();
    return false;
  }

  const payload = await res.json();
  setSession({ accessToken: payload.accessToken, refreshToken: payload.refreshToken });
  return true;
}

async function request(method, path, { body, query, headers = {}, raw = false, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });
  }

  const accessToken = getAccessToken();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const init = {
    method,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = isFormData ? body : JSON.stringify(body);

  try {
    const res = await fetch(url.toString(), init);
    if (res.status === 401 && retry && !path.includes("/api/auth/")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request(method, path, { body, query, headers, raw, retry: false });
      }
    }

    if (raw) return { data: res, error: null };

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : await res.text();
    if (!res.ok) return { data: null, error: payload?.error || { code: `HTTP_${res.status}`, message: res.statusText } };
    return { data: payload, error: null };
  } catch (err) {
    return { data: null, error: { code: "NETWORK", message: err.message } };
  }
}

function triggerBrowserDownload(blob, filename) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function downloadFile(path, { query, filename }) {
  const { data: res, error } = await request("GET", path, { query, raw: true });
  if (error) return { data: null, error };

  if (!res.ok) {
    let apiError = { code: `HTTP_${res.status}`, message: res.statusText || "Download failed" };
    try {
      const payload = await res.json();
      if (payload?.error) apiError = payload.error;
    } catch {
      // Keep fallback message when non-JSON error payload is returned.
    }
    return { data: null, error: apiError };
  }

  const blob = await res.blob();
  triggerBrowserDownload(blob, filename);
  return { data: { ok: true }, error: null };
}

export const api = {
  register: (body) => request("POST", "/api/auth/register", { body }),
  login: (body) => request("POST", "/api/auth/login", { body }),
  forgotPassword: (body) => request("POST", "/api/auth/forgot-password", { body }),
  resetPassword: (body) => request("POST", "/api/auth/reset-password", { body }),
  loginWithGoogle: (idToken) => request("POST", "/api/auth/google", { body: { idToken } }),
  refresh: (refreshToken) => request("POST", "/api/auth/refresh", { body: { refreshToken } }),
  me: () => request("GET", "/api/auth/me"),
  logout: () => request("POST", "/api/auth/logout", { body: { refreshToken: getRefreshToken() } }),
  adminListUsers: (query) => request("GET", "/api/auth/admin/users", { query }),
  adminCreateUser: (body) => request("POST", "/api/auth/admin/users", { body }),

  getMyProfile: () => request("GET", "/api/profiles/me"),
  upsertMyProfile: (body) => request("PUT", "/api/profiles/me", { body }),

  createClub: (body) => request("POST", "/api/clubs", { body }),
  listClubs: (query) => request("GET", "/api/clubs", { query }),
  updateClub: (id, body) => request("PATCH", `/api/clubs/${id}`, { body }),
  listClubParticipants: (clubId, query) => request("GET", `/api/clubs/${clubId}/participants`, { query }),
  createClubParticipant: (clubId, body) => request("POST", `/api/clubs/${clubId}/participants`, { body }),
  createClubParticipantResetLink: (clubId, profileId) => request("POST", `/api/clubs/${clubId}/participants/${profileId}/reset-link`),

  createApplication: (body) => request("POST", "/api/applications", { body }),
  listApplications: (query) => request("GET", "/api/applications", { query }),
  getApplication: (id) => request("GET", `/api/applications/${id}`),
  updateApplication: (id, body) => request("PATCH", `/api/applications/${id}`, { body }),
  submitApplication: (id) => request("POST", `/api/applications/${id}/submit`),
  resubmitApplication: (id) => request("POST", `/api/applications/${id}/resubmit`),
  requestApplicationCancel: (id, body) => request("POST", `/api/applications/${id}/cancel-request`, { body }),
  listApplicationDocuments: (id) => request("GET", `/api/applications/${id}/documents`),
  uploadApplicationDocument: (id, { file, kind, label, expiresOn }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    if (label) body.append("label", label);
    if (expiresOn) body.append("expiresOn", expiresOn);
    return request("POST", `/api/applications/${id}/documents`, { body });
  },

  assignReviewer: (id, reviewerId) => request("POST", `/api/reviews/${id}/assign`, { body: { reviewerId } }),
  startReview: (id) => request("POST", `/api/reviews/${id}/start`),
  decide: (id, body) => request("POST", `/api/reviews/${id}/decision`, { body }),
  bulkDecide: (body) => request("POST", `/api/reviews/bulk/decision`, { body }),
  reopen: (id, reason) => request("POST", `/api/reviews/${id}/reopen`, { body: { reason } }),

  queueBoard: (query) => request("GET", "/api/queue", { query }),
  queueSla: () => request("GET", "/api/queue/sla"),
  queueWorkload: () => request("GET", "/api/queue/workload"),

  fileAppeal: (body) => request("POST", "/api/appeals", { body }),
  myAppeals: () => request("GET", "/api/appeals/mine"),
  openAppeals: () => request("GET", "/api/appeals/open"),
  decideAppeal: (id, body) => request("POST", `/api/appeals/${id}/decision`, { body }),

  reportSummary: () => request("GET", "/api/reports/summary"),
  reportParticipants: (query) => request("GET", "/api/reports/participants", { query }),
  exportApprovedXlsx: () => `${BASE_URL}/api/reports/approved.xlsx`,
  exportApplicationPdf: (id) => `${BASE_URL}/api/reports/applications/${id}.pdf`,
  downloadApprovedXlsx: (query) => downloadFile("/api/reports/approved.xlsx", {
    query,
    filename: "approved-applications.xlsx",
  }),
  downloadApprovedParticipantsXlsx: (query) => downloadFile("/api/reports/participants.xlsx", {
    query,
    filename: "approved-participants.xlsx",
  }),
  downloadApplicationPdf: (id) => downloadFile(`/api/reports/applications/${id}.pdf`, {
    filename: `application-${id}.pdf`,
  }),

  verifyAudit: () => request("GET", "/api/audit/verify"),
  auditForEntity: (type, id) => request("GET", `/api/audit/entity/${type}/${id}`),
  exportAuditXlsx: () => `${BASE_URL}/api/audit/export.xlsx`,
  downloadAuditXlsx: (query) => downloadFile("/api/audit/export.xlsx", {
    query,
    filename: "audit-trail.xlsx",
  }),

  publicTournaments: () => request("GET", "/api/public/tournaments"),
  publicParticipants: (query) => request("GET", "/api/public/participants", { query }),
  publicClubs: (query) => request("GET", "/api/public/clubs", { query }),
  publicCirculars: (query) => request("GET", "/api/public/circulars", { query }),
  publicIndiaStates: () => request("GET", "/api/public/india/states"),
  publicIndiaDistricts: (state) => request("GET", "/api/public/india/districts", { query: { state } }),
  publicIndiaPincodeLookup: (pincode) => request("GET", `/api/public/india/pincode/${encodeURIComponent(pincode)}`),

  listCirculars: (query) => request("GET", "/api/circulars", { query }),
  createCircular: (body) => request("POST", "/api/circulars", { body }),
  updateCircular: (id, body) => request("PATCH", `/api/circulars/${id}`, { body }),
  deleteCircular: (id) => request("DELETE", `/api/circulars/${id}`),
};

export async function isApiLive() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

export default api;
