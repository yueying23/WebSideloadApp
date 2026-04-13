import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TwoFactorModal } from './TwoFactorModal';

describe('TwoFactorModal', () => {
  it('is hidden when closed', () => {
    const { container } = render(<TwoFactorModal open={false} onSubmit={() => {}} onCancel={() => {}} />);
    expect(container.querySelector('.modal')).not.toHaveClass('open');
  });

  it('focuses the input when opened', async () => {
    render(<TwoFactorModal open onSubmit={() => {}} onCancel={() => {}} />);
    // useEffect runs a setTimeout(0) before focusing — let it tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByLabelText('Verification Code')).toHaveFocus();
  });

  it('shows an inline error when submitting an empty code', async () => {
    const onSubmit = vi.fn();
    render(<TwoFactorModal open onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Please enter verification code.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the error once the user starts typing', async () => {
    render(<TwoFactorModal open onSubmit={() => {}} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByText('Please enter verification code.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Verification Code'), '1');
    expect(screen.queryByText('Please enter verification code.')).not.toBeInTheDocument();
  });

  it('submits a trimmed code on Enter', async () => {
    const onSubmit = vi.fn();
    render(<TwoFactorModal open onSubmit={onSubmit} onCancel={() => {}} />);
    const input = screen.getByLabelText('Verification Code');
    await userEvent.type(input, '  123456  ');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenLastCalledWith('123456');
  });

  it('submits via the Verify button', async () => {
    const onSubmit = vi.fn();
    render(<TwoFactorModal open onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('Verification Code'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(onSubmit).toHaveBeenLastCalledWith('654321');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<TwoFactorModal open onSubmit={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
