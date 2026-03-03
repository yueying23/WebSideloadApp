import MobileDevice from '../webmuxd';
import {
  BrowserPairingStore,
  BrowserUsbMuxClient,
  UsbMuxMessageType,
} from "../webmuxd"

test('Module defined', () => {
  expect(MobileDevice).toBeDefined();
});

test("Core exports defined", () => {
  expect(BrowserPairingStore).toBeDefined()
  expect(BrowserUsbMuxClient).toBeDefined()
  expect(UsbMuxMessageType.plist).toBe(8)
})
