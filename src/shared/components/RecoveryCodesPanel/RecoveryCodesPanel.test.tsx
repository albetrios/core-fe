import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { copySensitiveText } from '@/lib/sensitive-clipboard.ts';
import { notify } from '@/shared/notify/index.ts';

import { RecoveryCodesPanel } from './RecoveryCodesPanel.tsx';

vi.mock('@/lib/sensitive-clipboard.ts', () => ({
  copySensitiveText: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const CODES = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'];

// jsdom has no createObjectURL, and a real anchor click would try to navigate.
const createObjectURL = vi.fn(() => 'blob:recovery');
const revokeObjectURL = vi.fn();
const anchorClick = vi
  .spyOn(HTMLAnchorElement.prototype, 'click')
  .mockImplementation(() => undefined);

describe('RecoveryCodesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterAll(() => {
    anchorClick.mockRestore();
  });

  it('masks the codes by default and hides them from the a11y tree', () => {
    render(<RecoveryCodesPanel codes={CODES} onDone={vi.fn()} />);

    const list = screen.getByTestId('mfa-recovery-codes');
    expect(list).toHaveAttribute('aria-hidden', 'true');
    expect(list).not.toHaveTextContent('AAAA-1111');
    expect(list).toHaveTextContent('••••-••••');
  });

  it('reveal toggles the real codes on and off', () => {
    render(<RecoveryCodesPanel codes={CODES} onDone={vi.fn()} />);
    const toggle = screen.getByTestId('recovery-codes-panel-toggle-reveal');

    fireEvent.click(toggle);
    expect(screen.getByTestId('mfa-recovery-codes')).toHaveTextContent('AAAA-1111');
    expect(screen.getByTestId('mfa-recovery-codes')).toHaveAttribute(
      'aria-hidden',
      'false',
    );

    fireEvent.click(toggle);
    expect(screen.getByTestId('mfa-recovery-codes')).not.toHaveTextContent('AAAA-1111');
  });

  it('copy-all writes every code through the sensitive clipboard and confirms', async () => {
    render(<RecoveryCodesPanel codes={CODES} onDone={vi.fn()} />);

    fireEvent.click(screen.getByTestId('recovery-codes-panel-copy-all'));

    await waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
    expect(copySensitiveText).toHaveBeenCalledWith(CODES.join('\n'));
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('a clipboard failure surfaces an error instead of a silent no-op', async () => {
    vi.mocked(copySensitiveText).mockResolvedValueOnce(false);
    render(<RecoveryCodesPanel codes={CODES} onDone={vi.fn()} />);

    fireEvent.click(screen.getByTestId('recovery-codes-panel-copy-all'));

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('download builds a blob file, clicks it, and revokes the object URL', () => {
    render(<RecoveryCodesPanel codes={CODES} onDone={vi.fn()} />);

    fireEvent.click(screen.getByTestId('recovery-codes-panel-download'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery');
    expect(notify.info).toHaveBeenCalledTimes(1);
  });

  it('Done stays disabled until the saved acknowledgment is checked', () => {
    const onDone = vi.fn();
    render(<RecoveryCodesPanel codes={CODES} onDone={onDone} />);

    const done = screen.getByTestId('mfa-done');
    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('recovery-codes-panel-ack'));
    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <RecoveryCodesPanel codes={['AAAA-1111']} onDone={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
