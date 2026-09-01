import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import type { OnboardingStep } from '../../onboarding-flow.ts';
import { DoneStep } from './DoneStep.tsx';

/*
 * The step list arrives as a prop now (ONB-9): this component used to re-derive
 * it from its own `useMeContext` + `useDeploymentFlags`, which is why those two
 * had to be mocked here. A missing context would have made that second
 * derivation fall back to the permissive deployment flags and summarise a
 * different flow than the one the user actually walked. One derivation, made by
 * the page from a proven-loaded context, passed down.
 */
const TEAM_ONLY_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'profile',
  'questions',
  'workspace',
  'invite',
  'done',
];
const HYBRID_NO_TEAM_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'profile',
  'questions',
  'done',
];

describe('DoneStep', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('summarizes the collected onboarding data (team-only flow)', () => {
    useOnboardingStore.getState().patch({ organizationName: 'Acme Inc.' });
    render(<DoneStep steps={TEAM_ONLY_STEPS} />);
    expect(screen.getByText('Acme Inc.')).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument(); // invite step runs
  });

  it('hides the organization and invite rows when the flow never collected them (hybrid, no team)', () => {
    // personal-and-team with no team membership: steps are
    // welcome/profile/questions/done — no workspace step, no invite step.
    useOnboardingStore.getState().patch({ firstName: 'Ada', lastName: 'Lovelace' });
    render(<DoneStep steps={HYBRID_NO_TEAM_STEPS} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // No dangling "Organization: —" for a value this flow never asked for.
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it('hides the organization row in personal-only mode too', () => {
    useOnboardingStore.getState().patch({ firstName: 'Solo' });
    render(<DoneStep steps={HYBRID_NO_TEAM_STEPS} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('renders only the rows the given step list collected', () => {
    // The prop is the single input: same store data, different flow, different
    // rows — no hidden second derivation to disagree with the page.
    useOnboardingStore
      .getState()
      .patch({ firstName: 'Ada', organizationName: 'Acme Inc.', invites: ['a@b.test'] });

    const { unmount } = render(<DoneStep steps={HYBRID_NO_TEAM_STEPS} />);
    expect(screen.queryByText('Acme Inc.')).not.toBeInTheDocument();
    unmount();

    render(<DoneStep steps={TEAM_ONLY_STEPS} />);
    expect(screen.getByText('Acme Inc.')).toBeInTheDocument();
  });
});
