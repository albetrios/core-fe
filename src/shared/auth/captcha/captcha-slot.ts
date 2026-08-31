/**
 * Module-level registry for the inline captcha slot.
 *
 * An auth surface mounts {@link CaptchaSlot} to register a DOM element here, and the
 * app-global {@link InvisibleTurnstile} portals its widget container into it so an
 * escalated interactive challenge renders inside the form the user is already looking
 * at. With no slot registered the widget falls back to a viewport-centered overlay —
 * captcha-gated actions outside the auth screens (e.g. the email-verification resend
 * banner) still need a visible, completable challenge.
 */

type CaptchaSlotListener = () => void;

let slotElement: HTMLElement | null = null;
const slotListeners = new Set<CaptchaSlotListener>();

function notifyCaptchaSlotListeners(): void {
  for (const listener of slotListeners) {
    listener();
  }
}

/** Subscribe to slot registration changes (for the widget's portal target). */
export function subscribeCaptchaSlot(listener: CaptchaSlotListener): () => void {
  slotListeners.add(listener);
  return () => {
    slotListeners.delete(listener);
  };
}

/** Registers the element inline challenges render into, or clears it with `null`. */
export function setCaptchaSlot(element: HTMLElement | null): void {
  if (slotElement === element) return;
  slotElement = element;
  notifyCaptchaSlotListeners();
}

/** The currently registered inline slot, when an auth surface is mounted. */
export function getCaptchaSlot(): HTMLElement | null {
  return slotElement;
}
