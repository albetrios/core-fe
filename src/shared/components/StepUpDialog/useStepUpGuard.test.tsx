import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isStepUpRequiredError } = vi.hoisted(() => ({
  isStepUpRequiredError: vi.fn(),
}));
vi.mock('@/shared/api/step-up-api.ts', () => ({ isStepUpRequiredError }));
// The dialog has its own suite — stub it to a button that fires onVerified.
vi.mock('./StepUpDialog.tsx', () => ({
  StepUpDialog: ({
    onVerified,
    allowEmailCode,
  }: {
    onVerified: () => void;
    allowEmailCode?: boolean;
  }) => (
    <button
      type="button"
      data-testid="stub-step-up"
      data-allow-email={String(allowEmailCode)}
      onClick={onVerified}
    >
      verify
    </button>
  ),
}));

import { useStepUpGuard } from './useStepUpGuard.tsx';

function Harness({
  action,
  allowEmailCode,
  onError,
}: {
  action: () => Promise<unknown>;
  allowEmailCode?: boolean;
  onError?: (error: unknown) => void;
}) {
  const { guard, stepUpDialog } = useStepUpGuard();
  return (
    <div>
      <button
        type="button"
        data-testid="run"
        onClick={() => guard(action, { allowEmailCode, onError })}
      >
        run
      </button>
      {stepUpDialog}
    </div>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('useStepUpGuard', () => {
  it('opens the dialog on a step-up 403 and re-runs the action after verification', async () => {
    isStepUpRequiredError.mockReturnValue(true);
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error('step-up required'))
      .mockResolvedValueOnce('ok');
    const user = userEvent.setup();
    render(<Harness action={action} allowEmailCode={false} />);

    await user.click(screen.getByTestId('run'));
    const stub = await screen.findByTestId('stub-step-up');
    expect(stub).toHaveAttribute('data-allow-email', 'false');

    await user.click(stub);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    // The retry succeeded — no dialog remains.
    expect(screen.queryByTestId('stub-step-up')).not.toBeInTheDocument();
  });

  it('routes non-step-up errors to onError without opening the dialog', async () => {
    isStepUpRequiredError.mockReturnValue(false);
    const failure = new Error('boom');
    const action = vi.fn().mockRejectedValue(failure);
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<Harness action={action} onError={onError} />);

    await user.click(screen.getByTestId('run'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(screen.queryByTestId('stub-step-up')).not.toBeInTheDocument();
  });

  // ── SET-8: the guard's promise is what a dialog holds its busy state on ────

  it('resolves only once the action settles', async () => {
    // Regression: `guard` returned void, so ConfirmDialog's `await onConfirm()`
    // resolved instantly — the dialog vanished the moment you clicked Disable,
    // and the step-up prompt arrived seconds later with nothing to attach it to.
    let release!: (value: unknown) => void;
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const settled = vi.fn();

    function Await() {
      const { guard } = useStepUpGuard();
      return (
        <button
          type="button"
          data-testid="run"
          onClick={() => void guard(action).then(settled)}
        >
          run
        </button>
      );
    }
    const user = userEvent.setup();
    render(<Await />);
    await user.click(screen.getByTestId('run'));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(settled).not.toHaveBeenCalled(); // still in flight — dialog stays busy

    release(undefined);
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  });

  it('reports isGuarding while the action is in flight', async () => {
    let release!: (value: unknown) => void;
    const action = () =>
      new Promise((resolve) => {
        release = resolve;
      });

    function Flagged() {
      const { guard, isGuarding } = useStepUpGuard();
      return (
        <>
          <span data-testid="flag">{String(isGuarding)}</span>
          <button type="button" data-testid="run" onClick={() => void guard(action)}>
            run
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Flagged />);
    expect(screen.getByTestId('flag')).toHaveTextContent('false');

    await user.click(screen.getByTestId('run'));
    await waitFor(() => expect(screen.getByTestId('flag')).toHaveTextContent('true'));

    release(undefined);
    await waitFor(() => expect(screen.getByTestId('flag')).toHaveTextContent('false'));
  });

  it('drops a second guarded run fired before the first settles', async () => {
    // These are credential mutations — disable 2FA, revoke a passkey. One
    // gesture, one run, even inside the frame before the button disables.
    let release!: (value: unknown) => void;
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    function Twice() {
      const { guard } = useStepUpGuard();
      return (
        <button
          type="button"
          data-testid="run"
          onClick={() => {
            void guard(action);
            void guard(action);
          }}
        >
          run
        </button>
      );
    }
    const user = userEvent.setup();
    render(<Twice />);
    await user.click(screen.getByTestId('run'));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    release(undefined);
  });
});
