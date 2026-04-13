import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Field } from './Field';

describe('Field', () => {
  it('links the label to the input via htmlFor / id', () => {
    render(<Field label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
  });

  it('forwards the provided id when given', () => {
    render(<Field label="Email" id="my-email" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'my-email');
  });

  it('renders a hint when no error is present', () => {
    render(<Field label="N" hint="help text" />);
    expect(screen.getByText('help text')).toBeInTheDocument();
  });

  it('renders the error instead of the hint and marks aria-invalid', () => {
    render(<Field label="N" hint="ignored" error="bad" />);
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
    expect(screen.getByText('bad')).toBeInTheDocument();
    expect(screen.getByLabelText('N')).toHaveAttribute('aria-invalid', 'true');
  });

  it('fires onChange when typing', async () => {
    const onChange = vi.fn();
    render(<Field label="N" onChange={onChange} defaultValue="" />);
    await userEvent.type(screen.getByLabelText('N'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
