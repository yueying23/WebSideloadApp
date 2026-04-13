import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import type { StoredAccountSummary } from '../lib/account-session';

type Props = Parameters<typeof LoginPage>[0];

function defaultProps(overrides: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    loggedIn: false,
    savedAccounts: [],
    activeAccountKey: null,
    cachedAccountKeys: new Set(),
    onSwitchAccount: noop,
    onDeleteAccount: noop,
    onAddAccount: noop,
    onGoToSignPage: noop,
    ...overrides,
  };
}

describe('LoginPage', () => {
  it('renders heading and Add Account button', () => {
    render(<LoginPage {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Account' })).toBeInTheDocument();
  });

  it('shows empty state when no accounts', () => {
    render(<LoginPage {...defaultProps()} />);
    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
  });

  it('shows Sign & Install link when logged in', () => {
    render(<LoginPage {...defaultProps({ loggedIn: true })} />);
    expect(screen.getByRole('button', { name: /Sign & Install/ })).toBeInTheDocument();
  });

  it('fires onAddAccount when clicking Add Account', async () => {
    const onAdd = vi.fn();
    render(<LoginPage {...defaultProps({ onAddAccount: onAdd })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add Account' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('forwards saved accounts and propagates onSwitch + onDelete', async () => {
    const onSwitch = vi.fn();
    const onDelete = vi.fn();
    const acct: StoredAccountSummary = {
      appleId: 'u@e.com',
      teamId: 'T1',
      teamName: 'Team',
      updatedAtIso: '2024-01-01T00:00:00.000Z',
    };
    render(
      <LoginPage
        {...defaultProps({
          savedAccounts: [acct],
          activeAccountKey: null,
          cachedAccountKeys: new Set(),
          onSwitchAccount: onSwitch,
          onDeleteAccount: onDelete,
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Re-Login' }));
    expect(onSwitch).toHaveBeenCalledWith(acct);
  });
});
