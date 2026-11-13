import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageUploadField } from '../src/components/ImageUploadField';
import { PosApi } from '../src/services/api';
import { PosStorage } from '../src/services/storage';
import { isEmbeddedImage, isImageSource } from '../src/utils/imageUpload';

describe('image helpers', () => {
  it('detects embedded and linkable images', () => {
    expect(isEmbeddedImage('data:image/webp;base64,AAAA')).toBe(true);
    expect(isEmbeddedImage('🍕')).toBe(false);
    expect(isImageSource('https://example.com/a.jpg')).toBe(true);
    expect(isImageSource('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageSource('🍕')).toBe(false);
    expect(isImageSource('')).toBe(false);
  });
});

describe('ImageUploadField', () => {
  it('reports a friendly error for non-image files', async () => {
    const onChange = vi.fn();
    const { container } = render(<ImageUploadField id="img" value="" onChange={onChange} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await userEvent.setup({ applyAccept: false }).upload(input, file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an image file/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the image with Remove and shows the link box for URLs', async () => {
    const onChange = vi.fn();
    render(<ImageUploadField id="img" value="https://example.com/a.jpg" onChange={onChange} />);
    expect(screen.getByPlaceholderText(/paste an image link/i)).toHaveValue('https://example.com/a.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('deleting a category', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('removes its dishes locally and does not create Uncategorized', async () => {
    PosStorage.setCategories([
      { id: 'cat-all', name: 'All Menu', icon: '🍲', itemCount: 0, order: 0 },
      { id: 'cat-snacks', name: 'Snacks', icon: '🍔', itemCount: 1, order: 1 },
    ]);
    const base = { moneySchemaVersion: 2, pricePaisa: 1000, costPricePaisa: 500, stockQuantity: 5, minStockThreshold: 1, image: '', description: '', isAvailable: true, isDeal: false, variations: [], bundledProducts: [] };
    PosStorage.setProducts([
      { ...base, id: 'p1', name: 'Burger', categoryId: 'cat-snacks', categoryName: 'Snacks' },
      { ...base, id: 'p2', name: 'Pizza', categoryId: 'cat-pizza', categoryName: 'Pizza' },
    ] as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ headers: new Headers(), ok: true, json: async () => ({ success: true }) }));

    await PosApi.deleteCategory('cat-snacks', true);

    expect(PosStorage.getCategories().map(c => c.id)).toEqual(['cat-all']);
    expect(PosStorage.getProducts().map(p => p.id)).toEqual(['p2']);
  });
});
