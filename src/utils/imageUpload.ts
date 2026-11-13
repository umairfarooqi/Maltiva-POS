/** True when a stored image/icon value is an uploaded (embedded) image rather than an emoji or URL. */
export function isEmbeddedImage(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/** True when a value should be rendered with <img> (embedded upload or http(s)/relative URL). */
export function isImageSource(value: string | undefined | null): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.startsWith('data:image/') || /^https?:\/\//i.test(v) || v.startsWith('/');
}

/**
 * Reads a local image file, center-crops it to a square and downsizes it so it
 * can be stored directly in the database (works offline and is included in backups).
 */
export async function fileToSquareDataUrl(file: File, size = 480): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG or WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too large. Choose one under 15 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image could not be read. Try a JPG, PNG or WebP file.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const target = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);
  bitmap.close?.();

  // Keep each image comfortably small (~150 KB) so catalog requests stay fast.
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/webp', quality);
    if (url.length < 200_000) return url;
  }
  return canvas.toDataURL('image/webp', 0.3);
}

