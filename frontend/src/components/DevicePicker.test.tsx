import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DevicePicker } from './DevicePicker';

describe('DevicePicker', () => {
  it('shows the default placeholder text when no UDIDs exist', () => {
    render(
      <DevicePicker
        knownUdids={[]}
        connectedUdid={null}
        selectedUdid=""
        onSelectedChange={() => {}}
        onPair={() => {}}
        pairing={false}
        pairDisabled={false}
      />,
    );
    // "Connected:" is hidden when no device is connected.
    expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveDisplayValue('No paired device');
  });

  it('lists known UDIDs and echoes the selected value', () => {
    render(
      <DevicePicker
        knownUdids={['UDID-A', 'UDID-B']}
        connectedUdid="UDID-A"
        selectedUdid="UDID-A"
        onSelectedChange={() => {}}
        onPair={() => {}}
        pairing={false}
        pairDisabled={false}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('UDID-A');
    expect(screen.getAllByRole('option')).toHaveLength(3); // placeholder + 2
  });

  it('calls onSelectedChange when the user picks a UDID', async () => {
    const onChange = vi.fn();
    render(
      <DevicePicker
        knownUdids={['UDID-A', 'UDID-B']}
        connectedUdid={null}
        selectedUdid=""
        onSelectedChange={onChange}
        onPair={() => {}}
        pairing={false}
        pairDisabled={false}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'UDID-B');
    expect(onChange).toHaveBeenCalledWith('UDID-B');
  });

  it('fires onPair when the pair button is clicked (and is disabled / busy on demand)', async () => {
    const onPair = vi.fn();
    const { rerender } = render(
      <DevicePicker
        knownUdids={[]}
        connectedUdid={null}
        selectedUdid=""
        onSelectedChange={() => {}}
        onPair={onPair}
        pairing={false}
        pairDisabled={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Connect Device' }));
    expect(onPair).toHaveBeenCalled();

    rerender(
      <DevicePicker
        knownUdids={[]}
        connectedUdid={null}
        selectedUdid=""
        onSelectedChange={() => {}}
        onPair={onPair}
        pairing
        pairDisabled
      />,
    );
    expect(screen.getByRole('button', { name: /Connecting/ })).toBeDisabled();
  });
});
