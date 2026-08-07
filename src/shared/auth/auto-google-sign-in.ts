import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

const SKIP_AUTO_GOOGLE_KEY = `${PRODUCT_NAMESPACE}-auth-skip-auto-google`;

/** User cancelled auto Google or a prior attempt failed — skip until tab closes. */
export function skipAutoGoogleSignIn(): void {
  try {
    sessionStorage.setItem(SKIP_AUTO_GOOGLE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Whether the login screen may start Google OAuth automatically. */
export function shouldAttemptAutoGoogleSignIn(): boolean {
  try {
    return sessionStorage.getItem(SKIP_AUTO_GOOGLE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function clearAutoGoogleSignInSkip(): void {
  try {
    sessionStorage.removeItem(SKIP_AUTO_GOOGLE_KEY);
  } catch {
    /* ignore */
  }
}
