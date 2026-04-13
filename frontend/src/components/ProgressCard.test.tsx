import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProgressCard } from './ProgressCard';

describe('ProgressCard', () => {
  it('returns null when idle (not busy, percent=0)', () => {
    const { container } = render(<ProgressCard percent={0} status="idle" busy={false} logLines={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders full-screen modal when busy', () => {
    const { container } = render(<ProgressCard percent={45} status="signing: team ready" busy logLines={[]} />);
    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(screen.getByText('signing: team ready · 45%')).toBeInTheDocument();
    const fill = container.querySelector<HTMLDivElement>('.progress-fill')!;
    expect(fill.style.width).toBe('45%');
    expect(fill).toHaveAttribute('data-busy', 'true');
  });

  it('shows Done state with dismiss button when complete', async () => {
    const onDismiss = vi.fn();
    render(<ProgressCard percent={100} status="complete" busy={false} logLines={['done!']} onDismiss={onDismiss} />);
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows Failed state with close button', async () => {
    const onDismiss = vi.fn();
    render(<ProgressCard percent={0} status="failed" busy={false} logLines={[]} onDismiss={onDismiss} />);
    expect(screen.getByRole('heading', { name: 'Failed' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('auto-scrolls log to bottom', () => {
    render(<ProgressCard percent={50} status="working" busy logLines={['a', 'b', 'c']} />);
    const pre = document.querySelector('pre.log')!;
    expect(pre.textContent).toBe('a\nb\nc');
  });
});
