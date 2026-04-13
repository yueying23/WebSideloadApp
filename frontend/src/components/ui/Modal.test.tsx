import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('toggles the `open` class based on the prop', () => {
    const { rerender } = render(
      <Modal open={false} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    // aria-hidden true when closed
    const root = screen.getByRole('dialog', { hidden: true }).parentElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');

    rerender(
      <Modal open labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const openRoot = screen.getByRole('dialog').parentElement;
    expect(openRoot).toHaveAttribute('aria-hidden', 'false');
    expect(openRoot).toHaveClass('open');
  });

  it('closes on Escape when closeOnEscape (default)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t" closeOnEscape={false}>
        <h2 id="t">Title</h2>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop click by default', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on backdrop click when closeOnBackdrop is true', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t" closeOnBackdrop>
        <h2 id="t">Title</h2>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Title'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} labelledBy="t" closeOnBackdrop={false}>
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });
});
