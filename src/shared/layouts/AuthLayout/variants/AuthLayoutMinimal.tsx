import { Card, CardContent } from '@/shared/components/ui/card.tsx';
import {
  AuthControls,
  AuthForm,
  type AuthLayoutShellProps,
  BrandMark,
  SkipLink,
} from '@/shared/layouts/AuthLayout/AuthLayout.shared.tsx';

/** Variant 2 — minimal header + card form. */
export function MinimalAuth({ children }: AuthLayoutShellProps) {
  return (
    <div
      className="bg-background text-foreground flex min-h-screen flex-col"
      data-testid="auth-layout"
    >
      <SkipLink />
      <header className="relative flex items-center justify-between px-5 py-4 sm:px-8">
        <BrandMark />
        <AuthControls />
        <div
          className="via-primary/40 absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent"
          aria-hidden="true"
        />
      </header>

      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-5 py-12 sm:px-6"
      >
        <div className="w-full max-w-[400px]">
          <Card className="gap-0 py-0">
            <CardContent className="p-6 sm:p-8">
              <div
                data-slot="pill"
                className="bg-primary mx-auto mb-6 h-1 w-10 rounded-full"
                aria-hidden="true"
              />
              <AuthForm>{children}</AuthForm>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
