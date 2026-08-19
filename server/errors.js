export class ApiError extends Error {
  constructor(message, status = 400, code = 'API_ERROR', details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
