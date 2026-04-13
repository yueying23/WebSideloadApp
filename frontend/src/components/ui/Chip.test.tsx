import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders default tone without a data-tone attr', () => {
    render(<Chip>Default</Chip>);
    const el = screen.getByText('Default');
    expect(el).toHaveClass('chip');
    expect(el.hasAttribute('data-tone')).toBe(false);
  });

  it('sets data-tone for non-default tones', () => {
    const { rerender } = render(<Chip tone="success">Ok</Chip>);
    expect(screen.getByText('Ok')).toHaveAttribute('data-tone', 'success');

    rerender(<Chip tone="accent">Accent</Chip>);
    expect(screen.getByText('Accent')).toHaveAttribute('data-tone', 'accent');

    rerender(<Chip tone="danger">Err</Chip>);
    expect(screen.getByText('Err')).toHaveAttribute('data-tone', 'danger');
  });
});
