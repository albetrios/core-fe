import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getCaptchaSlot, setCaptchaSlot } from './captcha-slot.ts';
import { CaptchaSlot } from './CaptchaSlot.tsx';

describe('CaptchaSlot', () => {
  afterEach(() => {
    cleanup();
    setCaptchaSlot(null);
  });

  it('registers its element while mounted and clears it on unmount', () => {
    const { unmount } = render(<CaptchaSlot testId="captcha-slot-under-test" />);
    expect(getCaptchaSlot()).toBe(screen.getByTestId('captcha-slot-under-test'));

    unmount();
    expect(getCaptchaSlot()).toBeNull();
  });

  it('does not knock out a newer registration when an older slot unmounts', () => {
    const { unmount } = render(<CaptchaSlot testId="captcha-slot-under-test" />);
    const newer = document.createElement('div');
    setCaptchaSlot(newer);

    unmount();
    expect(getCaptchaSlot()).toBe(newer);
  });
});
