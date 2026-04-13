import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrustModal } from './TrustModal';

describe('TrustModal', () => {
  it('is hidden when closed', () => {
    const { container } = render(<TrustModal open={false} onClose={() => {}} pairing={false} />);
    const modal = container.querySelector('.modal');
    expect(modal).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows pairing state with spinner when pairing', () => {
    render(<TrustModal open onClose={() => {}} pairing />);
    expect(screen.getByText('Continue on Your Device')).toBeInTheDocument();
    expect(screen.getByText('Waiting for device…')).toBeInTheDocument();
  });

  it('shows success state with Continue button when paired', async () => {
    const onClose = vi.fn();
    render(<TrustModal open onClose={onClose} pairing={false} />);
    expect(screen.getByText('Device Paired')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
