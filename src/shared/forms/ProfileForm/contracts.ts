import { z } from 'zod';

/**
 * Editable profile fields. The source of truth for the "About you" form; the TS
 * type is inferred so the form, API payload, and completeness meter stay aligned.
 *
 * Only the fields core-be `PATCH /users/me` actually persists live here: `name`
 * → `first_name` + `last_name`, `jobTitle` → `job_title` (snake_case, mapped in
 * `authApi.updateProfile`). Bio / location / timezone are intentionally absent —
 * the backend has no column for them, so a form that showed them would silently
 * discard input while claiming success. Add them here (with their snake_case wire
 * names) once the backend model gains the columns.
 */
export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
  jobTitle: z.string().max(80, 'Job title is too long').optional().or(z.literal('')),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * Percentage (0–100) of the profile that has been filled in. Used by the
 * completeness meter in the profile header to nudge users to complete setup.
 */
export function computeProfileCompleteness(profile: Partial<ProfileInput>): number {
  const fields: (keyof ProfileInput)[] = ['name', 'jobTitle'];
  const filled = fields.filter((f) => Boolean(profile[f]?.toString().trim())).length;
  return Math.round((filled / fields.length) * 100);
}
