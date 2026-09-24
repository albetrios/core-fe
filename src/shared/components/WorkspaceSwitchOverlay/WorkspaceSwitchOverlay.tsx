import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { prefersReducedMotion } from '@/lib/animations/index.ts';
import { Spinner } from '@/shared/components/Spinner/index.ts';
import { LAYOUT_KEYS, LAYOUT_NS } from '@/shared/layouts/layout.constants.ts';
import { useWorkspaceSwitchStore } from '@/shared/store/useWorkspaceSwitchStore/index.ts';

/**
 * How long each reassurance line holds before the next one replaces it.
 *
 * Long enough to read, short enough that the screen is visibly doing something. A switch that
 * finishes quickly never gets past the first line, which is the intended behaviour: the later
 * lines exist for the slow case, not as a scripted sequence everyone has to sit through.
 */
const MESSAGE_INTERVAL_MS = 1_600;

/** The lines, in the order the wait actually happens. */
const SWITCH_MESSAGE_KEYS = [
  LAYOUT_KEYS.app.workspaceSwitch.preparing,
  LAYOUT_KEYS.app.workspaceSwitch.loadingAccess,
  LAYOUT_KEYS.app.workspaceSwitch.almostReady,
] as const;

/**
 * Full-viewport state shown while the user moves between workspaces.
 *
 * @remarks
 * The rest of the app deliberately does NOT blank on navigation — `RouteProgressBar` documents
 * that rule, and it is the right one for a page change. A workspace switch is the exception: the
 * screen underneath belongs to the workspace being left, so leaving it up means showing the old
 * organization's numbers under the new organization's name until the guards, token re-mint and
 * data all land. Covering it is more honest than that, and it answers the question the user
 * actually has, which is whether their click registered.
 *
 * The message rotates so a slow switch still looks alive. Under `prefers-reduced-motion` the
 * rotation is skipped entirely and the first line simply stays — the animation is decoration, and
 * the information is already in the workspace name above it.
 */
export function WorkspaceSwitchOverlay() {
  const { t } = useTranslation(LAYOUT_NS);
  const switchingTo = useWorkspaceSwitchStore((state) => state.switchingTo);
  const [messageIndex, setMessageIndex] = useState(0);
  const [shownFor, setShownFor] = useState(switchingTo);

  const isSwitching = switchingTo !== null;

  // Reset during render rather than from an effect. The overlay never unmounts — it lives in the
  // app shell — so there is no remount to restart the sequence, and doing it in an effect means a
  // second render pass that React (and the lint rule) rightly calls a cascading render. Adjusting
  // state while rendering when an input changed is the pattern React documents for exactly this.
  if (switchingTo !== shownFor) {
    setShownFor(switchingTo);
    setMessageIndex(0);
  }

  useEffect(() => {
    if (!isSwitching) return;
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      // Stops on the last line rather than looping: cycling back to "Preparing…" after "Almost
      // there" reads as a stall, and by then the honest signal is that it is simply taking a while.
      setMessageIndex((current) => Math.min(current + 1, SWITCH_MESSAGE_KEYS.length - 1));
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isSwitching]);

  if (!isSwitching) return null;

  const messageKey = SWITCH_MESSAGE_KEYS[messageIndex] ?? SWITCH_MESSAGE_KEYS[0];

  return (
    <output
      // `<output>` rather than a div with `role="status"`: the implicit role is the same and it is
      // the better-supported route across devices. Polite, not assertive — this is progress, and
      // an alert would interrupt whatever a screen reader was in the middle of saying.
      aria-live="polite"
      aria-busy="true"
      data-testid="workspace-switch-overlay"
      className="bg-background/95 fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 backdrop-blur-sm"
    >
      <Spinner className="text-primary size-8" />
      <p className="text-foreground text-lg font-semibold tracking-tight">
        {switchingTo}
      </p>
      {/* Keyed so the line fades in as it changes; the element is replaced, but it holds no state
          and nothing below it — the one place a key is the simple tool rather than the trap. */}
      <p
        key={messageKey}
        data-testid="workspace-switch-message"
        className="text-muted-foreground animate-fade-in-up text-sm"
      >
        {t(messageKey)}
      </p>
    </output>
  );
}
