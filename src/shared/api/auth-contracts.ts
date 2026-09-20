import { z } from 'zod';

import { AUTH_KEYS } from '@/shared/auth/auth-shell.constants.ts';

const v = AUTH_KEYS.validation;

/** Email/password login — retained for MFA handoff tests and legacy API surface. */

export type LoginInput = { email: string; password: string };

export const mfaVerifySchema = z
  .object({
    code: z.string().trim().min(1, v.codeRequired),
    useRecoveryCode: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (!(val.useRecoveryCode || /^\d{6}$/.test(val.code))) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message: v.mfaTotpFormat,
      });
    }
  });

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export type EmailVerificationCodeInput = { email: string; code: string };

/**
 * Successful `POST /auth/email/send-code` response body (the `{ data }` envelope).
 *
 * `debug_verification_code` is a **local/TEST_MODE-only** echo of the freshly issued
 * code, present only when core-be runs with `TEST_MODE` on (its `.refine()` forbids
 * that in production). Its mere presence is the gate: the SPA prefills the verify
 * step when it is there and does nothing when it is absent — so no client-side flag
 * is needed, and the field never reaches a real (mail-delivered / production) response.
 */
export const emailVerificationCodeSendResponseSchema = z.object({
  message: z.string().optional(),
  expires_in_minutes: z.number().optional(),
  debug_verification_code: z.string().optional(),
});

/** Inferred type of {@link emailVerificationCodeSendResponseSchema} — the parsed `send-code` body. */
export type EmailVerificationCodeSendResponse = z.infer<
  typeof emailVerificationCodeSendResponseSchema
>;
