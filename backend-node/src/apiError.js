/**
 * ApiError — consistent error shape for API responses.
 * status: HTTP status; code: machine-readable tag; details: optional object.
 */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, 'BAD_REQUEST', msg, details); }
  static unauthorized(msg = 'Unauthorized') { return new ApiError(401, 'UNAUTHORIZED', msg); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, 'FORBIDDEN', msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, 'NOT_FOUND', msg); }
  static conflict(msg, details) { return new ApiError(409, 'CONFLICT', msg, details); }
  static unprocessable(msg, details) { return new ApiError(422, 'UNPROCESSABLE', msg, details); }
}

module.exports = { ApiError };
