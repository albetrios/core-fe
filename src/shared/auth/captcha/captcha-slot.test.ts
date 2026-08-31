import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCaptchaSlot, setCaptchaSlot, subscribeCaptchaSlot } from './captcha-slot.ts';

describe('captcha-slot registry', () => {
  afterEach(() => {
    setCaptchaSlot(null);
  });

  it('stores and clears the registered element', () => {
    const el = document.createElement('div');
    expect(getCaptchaSlot()).toBeNull();

    setCaptchaSlot(el);
    expect(getCaptchaSlot()).toBe(el);

    setCaptchaSlot(null);
    expect(getCaptchaSlot()).toBeNull();
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCaptchaSlot(listener);

    const el = document.createElement('div');
    setCaptchaSlot(el);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setCaptchaSlot(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when re-registering the same element', () => {
    const listener = vi.fn();
    const el = document.createElement('div');
    setCaptchaSlot(el);

    subscribeCaptchaSlot(listener);
    setCaptchaSlot(el);
    expect(listener).not.toHaveBeenCalled();
  });
});
