import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropZone } from './DropZone';

function makeIpa(name = 'app.ipa', size = 2 * 1024 * 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

describe('DropZone', () => {
  it('shows the empty state by default', () => {
    render(<DropZone file={null} onFileChange={() => {}} />);
    expect(screen.getByText('No file selected')).toBeInTheDocument();
    expect(screen.getByText(/Click or drag \.ipa here/)).toBeInTheDocument();
  });

  it('shows the file name and size when a file is selected', () => {
    render(<DropZone file={makeIpa('demo.ipa', 2 * 1024 * 1024)} onFileChange={() => {}} />);
    expect(screen.getByText('demo.ipa')).toBeInTheDocument();
    expect(screen.getByText(/2\.00 MB/)).toBeInTheDocument();
  });

  it('fires onFileChange(null) when the Clear button is clicked', async () => {
    const onChange = vi.fn();
    render(<DropZone file={makeIpa()} onFileChange={onChange} />);
    await userEvent.click(screen.getByText('Clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('adds the `dragover` class on dragenter/dragover and removes on dragleave', () => {
    render(<DropZone file={null} onFileChange={() => {}} />);
    const zone = screen.getByText('No file selected').closest('label')!;
    expect(zone).not.toHaveClass('dragover');
    fireEvent.dragEnter(zone);
    expect(zone).toHaveClass('dragover');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass('dragover');
  });

  it('accepts a dropped file via the drop event', () => {
    const onChange = vi.fn();
    render(<DropZone file={null} onFileChange={onChange} />);
    const zone = screen.getByText('No file selected').closest('label')!;
    const dropped = makeIpa('drop.ipa', 100);
    fireEvent.drop(zone, {
      dataTransfer: { files: [dropped] },
    });
    expect(onChange).toHaveBeenCalledWith(dropped);
  });

  it('accepts a selected file via the hidden input', () => {
    const onChange = vi.fn();
    render(<DropZone file={null} onFileChange={onChange} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const selected = makeIpa('picked.ipa', 50);
    fireEvent.change(input, { target: { files: [selected] } });
    expect(onChange).toHaveBeenCalledWith(selected);
  });
});
