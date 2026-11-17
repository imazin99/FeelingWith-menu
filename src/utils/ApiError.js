// A single error shape the error-handling middleware normalizes into JSON
// (architecture doc, section 3: "a single Express error-handling middleware
// normalizes validation, auth and not-found errors into one JSON shape").
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  // Final review — multer error handling: file-size-limit violations
  // (413, not 400 — the request itself was well-formed, the payload was
  // just too big).
  static payloadTooLarge(message = 'Payload too large') {
    return new ApiError(413, message);
  }
}

module.exports = ApiError;
