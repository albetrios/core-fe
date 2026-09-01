import { Github } from '@/shared/icons/index.ts';

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" data-icon="">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'google') return <GoogleMark />;
  if (provider === 'github') return <Github className="size-4" data-icon="" />;
  if (provider === 'apple') {
    return (
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" data-icon="">
        <path
          d="M17.05 20.28c-.98.95-2.05 1.88-3.71 1.88-1.56 0-2.05-.93-3.82-.93-1.77 0-2.32.9-3.81.98-1.53.08-2.7-1.45-3.71-2.4C1.79 15.25 1.04 10.94 3.03 7.86c1.2-2.05 3.34-3.35 5.68-3.38 1.56-.03 3.03 1.05 3.98 1.05.95 0 2.74-1.3 4.62-1.11.79.03 3.01.32 4.43 2.41-3.7 2.01-3.1 7.24.76 8.85-.63 1.62-1.45 3.23-2.45 4.6zM12.03 4.5c-.13-2.23 1.67-4.14 3.74-4.36.28 2.58-2.34 4.5-3.74 4.36z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return null;
}
