import React, { useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { fileToSquareDataUrl, isEmbeddedImage, isImageSource } from '../utils/imageUpload';

interface ImageUploadFieldProps {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  size?: number;
}

/** Choose a local image from this computer (stored in the app) or paste an optional link. */
export function ImageUploadField({ id, label = 'Image', value, onChange, size = 480 }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const embedded = isEmbeddedImage(value);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await fileToSquareDataUrl(file, size));
    } catch (e: any) {
      setError(e?.message || 'Could not use that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group">
      <label htmlFor={id} className="text-xs font-bold text-pos-secondary block mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-pos-border bg-pos-raised">
          {isImageSource(value) && (
            <img src={value} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" tabIndex={-1} aria-hidden="true" />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? 'Processing...' : 'Choose from computer'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" onClick={() => { setError(''); onChange(''); }}>
                Remove
              </Button>
            )}
          </div>
          {embedded ? (
            <p className="text-xs text-pos-muted">Local image saved with the menu.</p>
          ) : (
            <Input
              id={id}
              type="text"
              value={value}
              placeholder="Or paste an image link (optional)"
              onChange={e => onChange(e.target.value)}
              className="w-full"
            />
          )}
          {error && <p role="alert" className="text-xs text-pos-danger-text">{error}</p>}
        </div>
      </div>
    </div>
  );
}

