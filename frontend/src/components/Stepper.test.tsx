import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from './Stepper';

describe('Stepper', () => {
  it('renders labels and numbered markers for idle / active states', () => {
    render(
      <Stepper
        steps={[
          { label: 'One', state: 'active' },
          { label: 'Two', state: 'idle' },
        ]}
      />,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows a checkmark for done steps', () => {
    render(
      <Stepper
        steps={[
          { label: 'One', state: 'done' },
          { label: 'Two', state: 'active' },
        ]}
      />,
    );
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('sets data-state on each step for CSS styling', () => {
    render(
      <Stepper
        steps={[
          { label: 'A', state: 'active' },
          { label: 'B', state: 'done' },
          { label: 'C', state: 'idle' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-state', 'active');
    expect(items[1]).toHaveAttribute('data-state', 'done');
    expect(items[2]).toHaveAttribute('data-state', 'idle');
  });
});
