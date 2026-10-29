function receiptLayout(paperWidth: '58mm' | '80mm'): string {
  return `
    html, body { width: ${paperWidth}; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: white; }
    #thermal-receipt-print-area { position: static !important; display: flex !important; flex-direction: column; align-items: stretch; flex: none !important; width: ${paperWidth} !important; max-width: ${paperWidth} !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; box-sizing: border-box; margin: 0 !important; padding: 2mm !important; gap: 3mm !important; background: white !important; color: black !important; page: auto !important; }
    #thermal-receipt-print-area > div { width: 100% !important; max-width: none !important; flex-shrink: 0; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: white !important; box-shadow: none !important; }
    #thermal-receipt-print-area, #thermal-receipt-print-area * { visibility: visible !important; }
  `;
}

function pageSize(receipt: HTMLElement, paperWidth: '58mm' | '80mm'): string {
  // A rounding allowance prevents an otherwise empty trailing page.
  const heightMm = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 1;
  return `@page { size: ${paperWidth} ${heightMm}mm; margin: 0; }`;
}

/** Prepare the main document for Ctrl+P and the browser's Print menu. */
export function prepareReceiptPrint(receipt: HTMLElement, paperWidth: '58mm' | '80mm'): () => void {
  const doc = receipt.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = receiptLayout(paperWidth) + `
    body *:not(#thermal-receipt-print-area):not(#thermal-receipt-print-area *):not(:has(#thermal-receipt-print-area)) { display: none !important; }
    body *:has(#thermal-receipt-print-area) { display: block !important; position: static !important; width: auto !important; height: auto !important; min-height: 0 !important; max-height: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; overflow: visible !important; }
  `;
  doc.head.appendChild(style);
  style.textContent += pageSize(receipt, paperWidth);
  return () => style.remove();
}

/** Print an isolated receipt on a page sized to its actual rendered content. */
export async function printReceipt(receipt: HTMLElement, paperWidth: '58mm' | '80mm'): Promise<void> {
  const frame = document.createElement('iframe');
  frame.title = 'Receipt print document';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;border:0;';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    const printWindow = frame.contentWindow!;
    doc.title = 'Receipt';
    const base = doc.createElement('base');
    base.href = document.baseURI;
    doc.head.appendChild(base);
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    await Promise.all(styles.map(source => new Promise<void>((resolve, reject) => {
      const copy = source.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
      if (copy instanceof HTMLLinkElement) {
        copy.onload = () => { clearTimeout(timeout); resolve(); };
        copy.onerror = () => { clearTimeout(timeout); reject(new Error('Could not load receipt print styles. Please retry.')); };
        const timeout = window.setTimeout(() => reject(new Error('Receipt print styles took too long to load. Please retry.')), 10000);
      } else resolve();
      doc.head.appendChild(copy);
    })));
    const layout = doc.createElement('style');
    // Apply the same compact layout during measurement and printing.
    layout.textContent = receiptLayout(paperWidth);
    doc.head.appendChild(layout);
    const content = receipt.cloneNode(true) as HTMLElement;
    doc.body.appendChild(content);
    await doc.fonts?.ready;
    const page = doc.createElement('style');
    page.textContent = pageSize(content, paperWidth);
    doc.head.appendChild(page);
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
