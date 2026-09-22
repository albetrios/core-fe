import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ValidationError } from '@/shared/errors/AppError.ts';
import { isHttpError } from '@/shared/errors/HttpError.ts';

/** Read per-field validation messages from a core-be error body. */
function readFieldErrors(data: unknown): Record<string, string[]> | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as {
    error?: { fields?: unknown; field_errors?: unknown };
    errors?: unknown;
  };
  const nested = body.error?.fields ?? body.error?.field_errors ?? body.errors;
  if (!nested || typeof nested !== 'object') return null;

  // Field names come straight off the wire, so they are attacker-influenced in principle.
  // A null-prototype accumulator means a payload carrying `__proto__` (or `constructor`)
  // writes an ordinary own property instead of reaching the prototype chain — `{}` would
  // have let `out['__proto__'] = […]` reassign this object's prototype.
  const out = Object.create(null) as Record<string, string[]>;
  for (const [field, value] of Object.entries(nested as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const messages = value.filter((m): m is string => typeof m === 'string');
      if (messages.length > 0) out[field] = messages;
      continue;
    }
    if (typeof value === 'string') {
      out[field] = [value];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Map a 422 / validation failure onto react-hook-form field errors.
 * Returns `true` when at least one field error was applied.
 */
export function mapValidationErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (error instanceof ValidationError) {
    let applied = false;
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const message = messages[0];
      if (!message) continue;
      setError(field as Path<T>, { type: 'server', message });
      applied = true;
    }
    return applied;
  }

  if (isHttpError(error) && error.status === 422) {
    const fields = readFieldErrors(error.data);
    if (!fields) return false;
    for (const [field, messages] of Object.entries(fields)) {
      const message = messages[0];
      if (!message) continue;
      setError(field as Path<T>, { type: 'server', message });
    }
    return true;
  }

  return false;
}
