import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders the idle label and fires onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveClass('btn', 'btn-primary');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the busy label + spinner and is disabled while busy', () => {
    render(
      <Button variant="primary" busy busyLabel="Working…">
        Go
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /Working/ });
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.spinner')).toBeInTheDocument();
  });

  it('honors the disabled prop and suppresses onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="ghost" disabled onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn).catch(() => {
      /* user-event may throw on disabled — that's fine */
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies ghost and accent variant classes', () => {
    const { rerender } = render(<Button variant="ghost">a</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-ghost');
    rerender(<Button variant="accent">a</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-accent');
  });

  it('applies the small size class when size="sm"', () => {
    render(
      <Button variant="ghost" size="sm">
        small
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('btn-sm');
  });

  it('falls back to "Working…" when no busyLabel provided', () => {
    render(
      <Button variant="primary" busy>
        Go
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Working…');
  });
});
