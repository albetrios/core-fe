import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspaceSwitchStore } from './useWorkspaceSwitchStore.ts';

describe('useWorkspaceSwitchStore', () => {
  beforeEach(() => {
    useWorkspaceSwitchStore.setState({ switchingTo: null });
  });

  it('starts idle', () => {
    expect(useWorkspaceSwitchStore.getState().switchingTo).toBeNull();
  });

  it('carries the name of the workspace being entered', () => {
    useWorkspaceSwitchStore.getState().beginSwitch('Acme Corp');
    // The name, not a boolean: the overlay has to say WHICH workspace, or it answers "something is
    // happening" when the user's question is "did it take the one I picked?".
    expect(useWorkspaceSwitchStore.getState().switchingTo).toBe('Acme Corp');
  });

  it('returns to idle when the switch ends', () => {
    useWorkspaceSwitchStore.getState().beginSwitch('Acme Corp');
    useWorkspaceSwitchStore.getState().endSwitch();
    expect(useWorkspaceSwitchStore.getState().switchingTo).toBeNull();
  });

  it('retargets when a second switch starts before the first cleared', () => {
    // The switcher latches against concurrent switches, but a switch that fails and is retried
    // must not leave the overlay naming the workspace the user gave up on.
    useWorkspaceSwitchStore.getState().beginSwitch('Acme Corp');
    useWorkspaceSwitchStore.getState().beginSwitch('Other Workspace');
    expect(useWorkspaceSwitchStore.getState().switchingTo).toBe('Other Workspace');
  });
});
