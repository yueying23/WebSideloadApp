import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('reflects the active page via data-active', () => {
    render(<Header currentPage="login" onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /Sign & Install/ })).toHaveAttribute('data-active', 'false');
  });

  it('calls onNavigate when clicking the nav buttons', async () => {
    const onNav = vi.fn();
    render(<Header currentPage="login" onNavigate={onNav} />);
    await userEvent.click(screen.getByRole('button', { name: /Sign & Install/ }));
    expect(onNav).toHaveBeenCalledWith('sign');

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(onNav).toHaveBeenCalledWith('login');
  });

  it('wordmark click also navigates to login (and prevents the anchor default)', async () => {
    const onNav = vi.fn();
    render(<Header currentPage="sign" onNavigate={onNav} />);
    const link = screen.getByRole('link', { name: /AltStore Web/ });
    await userEvent.click(link);
    expect(onNav).toHaveBeenCalledWith('login');
    // Hash should not have been mutated by the default anchor behavior.
    expect(window.location.hash).toBe('');
  });
});
