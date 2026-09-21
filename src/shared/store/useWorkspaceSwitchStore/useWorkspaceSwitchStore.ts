import { create } from 'zustand';

/**
 * Whether a workspace switch is in flight, and which workspace it is heading for.
 *
 * @remarks
 * A switch is not an ordinary navigation. The screen the user is looking at belongs to the
 * workspace they are LEAVING, so every number on it is about to be wrong — which is exactly when
 * the house rule for in-app navigation (keep the current screen, show the thin progress bar) reads
 * as "nothing happened". A switch earns a foreground state; a page change does not.
 *
 * Kept in a store rather than component state because the control that starts the switch lives in
 * the app shell while the overlay covers the viewport, and because a team → team switch is a param
 * change on the same shell: nothing unmounts, so there is no remount to hang the state off.
 */
interface WorkspaceSwitchState {
  /** Display name of the workspace being switched to, or `null` when idle. */
  switchingTo: string | null;
  beginSwitch: (workspaceName: string) => void;
  endSwitch: () => void;
}

export const useWorkspaceSwitchStore = create<WorkspaceSwitchState>((set) => ({
  switchingTo: null,
  beginSwitch: (workspaceName) => set({ switchingTo: workspaceName }),
  endSwitch: () => set({ switchingTo: null }),
}));
