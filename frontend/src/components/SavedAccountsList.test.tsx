import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SavedAccountsList } from './SavedAccountsList';
import type { StoredAccountSummary } from '../lib/account-session';

const sampleAccounts: StoredAccountSummary[] = [
  {
    appleId: 'alpha@e.com',
    teamId: 'T1',
    teamName: 'Alpha Team',
    updatedAtIso: '2024-01-01T00:00:00.000Z',
  },
  {
    appleId: 'beta@e.com',
    teamId: 'T2',
    teamName: 'Beta Team',
    updatedAtIso: 'not-a-date',
  },
];

describe('SavedAccountsList', () => {
  it('shows an empty state when there are no accounts', () => {
    render(<SavedAccountsList accounts={[]} activeKey={null} cachedKeys={new Set()} onSwitch={() => {}} />);
    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
  });

  it('renders each row with team info and the correct action', () => {
    render(
      <SavedAccountsList
        accounts={sampleAccounts}
        activeKey="alpha@e.com::T1"
        cachedKeys={new Set(['alpha@e.com::T1'])}
        onSwitch={() => {}}
      />,
    );
    expect(screen.getByText('alpha@e.com')).toBeInTheDocument();
    expect(screen.getByText('beta@e.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-Login' })).toBeEnabled();
  });

  it('falls back to the raw updated-at string when it fails to parse', () => {
    render(<SavedAccountsList accounts={sampleAccounts} activeKey={null} cachedKeys={new Set()} onSwitch={() => {}} />);
    expect(screen.getByText(/Beta Team · T2 · not-a-date/)).toBeInTheDocument();
  });

  it("uses 'Switch' when a cached session exists for a non-active row", () => {
    render(
      <SavedAccountsList
        accounts={sampleAccounts}
        activeKey={null}
        cachedKeys={new Set(['beta@e.com::T2'])}
        onSwitch={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Switch' })).toBeEnabled();
  });

  it('calls onSwitch with the clicked summary', async () => {
    const onSwitch = vi.fn();
    render(<SavedAccountsList accounts={sampleAccounts} activeKey={null} cachedKeys={new Set()} onSwitch={onSwitch} />);
    const buttons = screen.getAllByRole('button', { name: 'Re-Login' });
    await userEvent.click(buttons[0]);
    expect(onSwitch).toHaveBeenCalledWith(sampleAccounts[0]);
  });

  it('shows delete button and fires onDelete', async () => {
    const onDelete = vi.fn();
    render(
      <SavedAccountsList
        accounts={sampleAccounts}
        activeKey={null}
        cachedKeys={new Set()}
        onSwitch={() => {}}
        onDelete={onDelete}
      />,
    );
    const deleteButtons = screen.getAllByTitle('Remove account');
    expect(deleteButtons).toHaveLength(2);
    await userEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith(sampleAccounts[0]);
  });
});
