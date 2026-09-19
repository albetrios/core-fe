import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import { ProfileStep } from './ProfileStep.tsx';

describe('ProfileStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('patches the first and last name into the onboarding store', async () => {
    const user = userEvent.setup();
    render(<ProfileStep />);
    await user.type(screen.getByTestId('onboarding-first-name'), 'Ada');
    await user.type(screen.getByTestId('onboarding-last-name'), 'Lovelace');
    expect(useOnboardingStore.getState().data.firstName).toContain('Ada');
    expect(useOnboardingStore.getState().data.lastName).toContain('Lovelace');
  });

  /*
   * ONB-13. `useOnboardingStore()` with no selector subscribes to the whole
   * store, and `patch` replaces the entire `data` object — so typing in the
   * questions step, or anywhere else in the wizard, re-rendered this component
   * too. A `Profiler` commit is the observable: no re-render, no commit.
   */
  it('does not re-render when an unrelated field changes', async () => {
    let commits = 0;
    render(
      <Profiler
        id="profile-step"
        onRender={() => {
          commits += 1;
        }}
      >
        <ProfileStep />
      </Profiler>,
    );
    const afterMount = commits;
    expect(afterMount).toBeGreaterThan(0);

    // Fields this step does not read: the questions step and the workspace step.
    await act(async () => {
      useOnboardingStore.getState().patch({ teamSize: '2–10' });
      useOnboardingStore.getState().patch({ referralSource: 'search' });
      useOnboardingStore.getState().patch({ organizationName: 'Acme Inc.' });
    });
    expect(commits).toBe(afterMount);

    // ...and it still re-renders for a field it DOES read.
    await act(async () => {
      useOnboardingStore.getState().patch({ firstName: 'Ada' });
    });
    expect(commits).toBeGreaterThan(afterMount);
    expect(screen.getByTestId('onboarding-first-name')).toHaveValue('Ada');
  });
});
