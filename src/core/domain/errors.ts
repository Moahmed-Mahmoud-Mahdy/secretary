/** Base error carrying an HTTP status + Arabic user-facing message. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'APP_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'لازم تسجل دخول الأول') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'العنصر ده مش موجود') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class AiInterpretationError extends AppError {
  constructor(message: string = 'معرفتش أفهم الرسالة دي — ممكن توضحلي تاني؟') {
    super(message, 502, 'AI_INTERPRETATION_ERROR');
    this.name = 'AiInterpretationError';
  }
}
