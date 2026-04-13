import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface TwoFactorModalProps {
  open: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

export function TwoFactorModal({ open, onSubmit, onCancel }: TwoFactorModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      setError('Please enter verification code.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Modal open={open} onClose={onCancel} labelledBy="two-factor-title" closeOnBackdrop={false}>
      <h2 id="two-factor-title" className="text-[16px] font-semibold tracking-tight text-ink">
        Two-Factor Authentication
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-muted">
        Enter the verification code from your trusted Apple device.
      </p>

      <label htmlFor="two-factor-code" className="mt-5 mb-1.5 block text-[12.5px] font-medium text-muted">
        Verification Code
      </label>
      <input
        ref={inputRef}
        id="two-factor-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        placeholder="123456"
        className="field-input font-mono text-center text-[18px] tracking-[0.3em]"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <p className="mt-2 min-h-[18px] text-[12px] text-[var(--color-danger)]">{error ?? ''}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit}>
          Verify
        </Button>
      </div>
    </Modal>
  );
}
