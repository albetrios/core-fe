import '@testing-library/jest-dom/vitest';
import '@/lib/i18n/i18n.ts';

import { beforeAll, beforeEach, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

import { ensureLocale } from '@/lib/i18n/load-namespace.ts';

expect.extend(matchers);

beforeAll(async () => {
  await ensureLocale('en');
});

// jsdom >= 30.1 parks the focus pointer on the Document when the focused node is
// removed (Node-impl `_removingSteps`), where 30.0 reset it to nothing. The next
// `.focus()` then sees a truthy "previously focused" value and fires `blur` on it —
// and the focus-event target adjustment rewrites a Document target to the **window**.
// Radix Menu and Select both close on `window` blur ("the browser tab lost focus"), so
// from the second render onwards in a file every dropdown shut itself the instant its
// content auto-focused. Reset the pointer before each test: focusing then blurring a
// throwaway element is the only public path back to "nothing focused" (`document.body`
// is not a focusable area in jsdom, so blurring it is a no-op).
beforeEach(() => {
  const focusReset = document.createElement('button');
  document.body.append(focusReset);
  focusReset.focus();
  focusReset.blur();
  focusReset.remove();
});

// jsdom does not implement matchMedia — required by useThemeStore
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement ResizeObserver — required by some Radix primitives
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom does not implement IntersectionObserver — required by embla-carousel
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// input-otp uses elementFromPoint for focus management — stub in jsdom.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

// Radix Select relies on pointer capture + scrollIntoView — stub in jsdom.
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
