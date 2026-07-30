export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(message: string): HttpError {
  return new HttpError(message, 404);
}

export function badRequest(message: string, code?: string): HttpError {
  return new HttpError(message, 400, code);
}

export function forbidden(message: string, code?: string): HttpError {
  return new HttpError(message, 403, code);
}

export function conflict(message: string, code?: string): HttpError {
  return new HttpError(message, 409, code);
}
