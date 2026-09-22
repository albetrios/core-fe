import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

/** i18next namespace for the auth-shell page family (login, MFA, callback, …). */
export const AUTH_NS = I18N_NAMESPACES.auth;

export const AUTH_KEYS = {
  manifest: {
    login: 'manifest.login.title',
    mfa: 'manifest.mfa.title',
    callback: 'manifest.callback.title',
    acceptInvite: 'manifest.acceptInvite.title',
  },
  common: {
    email: 'common.email',
    password: 'common.password',
    emailPlaceholder: 'common.emailPlaceholder',
    passwordPlaceholder: 'common.passwordPlaceholder',
    newPasswordPlaceholder: 'common.newPasswordPlaceholder',
    confirmPasswordPlaceholder: 'common.confirmPasswordPlaceholder',
    confirmPassword: 'common.confirmPassword',
    showPassword: 'common.showPassword',
    hidePassword: 'common.hidePassword',
    signIn: 'common.signIn',
    signUp: 'common.signUp',
    backToSignIn: 'common.backToSignIn',
    goToSignIn: 'common.goToSignIn',
    tryAgain: 'common.tryAgain',
    goToDashboard: 'common.goToDashboard',
    sending: 'common.sending',
    sendingEllipsis: 'common.sendingEllipsis',
    verifying: 'common.verifying',
    pleaseWait: 'common.pleaseWait',
  },
  auth: {
    heading: 'auth.heading',
    subheading: 'auth.subheading',
    unavailable: 'auth.unavailable',
    continueWithProvider: 'auth.continueWithProvider',
    continueWithPasskey: 'auth.continueWithPasskey',
    dividerOr: 'auth.dividerOr',
    emailContinue: 'auth.emailContinue',
    tryAgainIn: 'auth.tryAgainIn',
    tryAgainPrefix: 'auth.tryAgainPrefix',
    back: 'auth.back',
    errors: {
      passkeyBackend: 'auth.errors.passkeyBackend',
      oauthFailed: 'auth.errors.oauthFailed',
    },
    autoGoogleSigningIn: 'auth.autoGoogleSigningIn',
    useEmailInstead: 'auth.useEmailInstead',
    verify: {
      heading: 'auth.verify.heading',
    },
    email: {
      codeSentTo: 'auth.email.codeSentTo',
      codeLabel: 'auth.email.codeLabel',
      codeAria: 'auth.email.codeAria',
      verifyAndContinue: 'auth.email.verifyAndContinue',
      resendHint: 'auth.email.resendHint',
      resendCode: 'auth.email.resendCode',
      wrongEmailPrompt: 'auth.email.wrongEmailPrompt',
      changeEmailAddress: 'auth.email.changeEmailAddress',
      toast: { codeSent: 'auth.email.toast.codeSent' },
    },
  },
  login: {
    errors: {
      invalidCredentials: 'login.errors.invalidCredentials',
      invalidVerificationCode: 'login.errors.invalidVerificationCode',
    },
    oauth: {
      providerKey: (name: string) => `login.oauth.providers.${name}`,
    },
  },
  mfa: {
    sessionExpiredHeading: 'mfa.sessionExpiredHeading',
    sessionExpiredSubheading: 'mfa.sessionExpiredSubheading',
    heading: 'mfa.heading',
    authenticatorHint: 'mfa.authenticatorHint',
    recoveryHint: 'mfa.recoveryHint',
    codeLabel: 'mfa.codeLabel',
    recoveryCodeLabel: 'mfa.recoveryCodeLabel',
    codePlaceholder: 'mfa.codePlaceholder',
    recoveryPlaceholder: 'mfa.recoveryPlaceholder',
    submit: 'mfa.submit',
    verifying: 'mfa.verifying',
    useRecovery: 'mfa.useRecovery',
    useAuthenticator: 'mfa.useAuthenticator',
    errors: {
      sessionExpired: 'mfa.errors.sessionExpired',
      invalidCode: 'mfa.errors.invalidCode',
    },
  },
  acceptInvite: {
    joiningTitle: 'acceptInvite.joiningTitle',
    problemTitle: 'acceptInvite.problemTitle',
    accepting: 'acceptInvite.accepting',
    success: 'acceptInvite.success',
    switchFailed: 'acceptInvite.switchFailed',
    switchFailedToast: 'acceptInvite.switchFailedToast',
    errors: {
      generic: 'acceptInvite.errors.generic',
      invalidOrExpired: 'acceptInvite.errors.invalidOrExpired',
    },
  },
  organizationPicker: {
    heading: 'organizationPicker.heading',
    subheading: 'organizationPicker.subheading',
    listTitle: 'organizationPicker.listTitle',
    loadError: 'organizationPicker.loadError',
    empty: 'organizationPicker.empty',
    create: 'organizationPicker.create',
  },
  validation: {
    emailRequired: 'validation.emailRequired',
    invalidEmail: 'validation.invalidEmail',
    passwordRequired: 'validation.passwordRequired',
    passwordMinLength: 'validation.passwordMinLength',
    confirmPasswordRequired: 'validation.confirmPasswordRequired',
    passwordsMismatch: 'validation.passwordsMismatch',
    tokenRequired: 'validation.tokenRequired',
    codeRequired: 'validation.codeRequired',
    mfaTotpFormat: 'validation.mfaTotpFormat',
    emailVerificationCodeLength: 'validation.emailVerificationCodeLength',
  },
  apiErrors: {
    mfaUnsupported: 'apiErrors.mfaUnsupported',
    oauthNoRedirect: 'apiErrors.oauthNoRedirect',
    passkeyCancelled: 'apiErrors.passkeyCancelled',
  },
} as const;

export const AUTH_EMAIL_VERIFICATION_CODE_LENGTH = 6;
export const AUTH_MFA_RECOVERY_MAX_LENGTH = 32;
export const ACCEPT_INVITE_REDIRECT_MS = 900;
