import { afterEach, describe, expect, it, vi } from 'vitest';
import { printReceipt } from '../src/utils/printReceipt';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('isolated receipt printing', () => {
  it.each(['58mm', '80mm'] as const)('sizes %s paper to content and removes the frame after printing', async width => {
    const receipt = document.createElement('div');
    receipt.id = 'thermal-receipt-print-area';
    receipt.textContent = 'One pizza';
    document.body.innerHTML = '<main>Unrelated tall app layout</main>';
    document.body.appendChild(receipt);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 480 } as DOMRect);
    const printing = printReceipt(receipt, width);
    const frame = document.querySelector('iframe')!;
    const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
    await printing;
    const doc = frame.contentDocument!;
    expect(doc.body.textContent).toBe('One pizza');
    expect(doc.head.textContent).toContain(`size: ${width} 128mm; margin: 0;`);
    expect(print).toHaveBeenCalledOnce();
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('main')).toHaveTextContent('Unrelated tall app layout');
  });

  it('reports stylesheet failures without opening an unformatted receipt', async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/missing-print-styles.css';
    document.body.appendChild(link);
    const printing = printReceipt(document.createElement('div'), '58mm');
    const failure = expect(printing).rejects.toThrow('Could not load receipt print styles');
    document.querySelector('iframe')!.contentDocument!.querySelector('link')!.dispatchEvent(new Event('error'));
    await failure;
    expect(document.querySelector('iframe')).toBeNull();
  });
});
