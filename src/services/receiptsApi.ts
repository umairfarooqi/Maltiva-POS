import { Order } from '../types/pos';
import { PosStorage } from './storage';
import { sessionFetch } from './session';
export interface ReceiptSummary {
  id: string; orderNumber: string; tokenNumber: number; businessDate: string; createdAt: string;
  totalPaisa: number; paymentMethod: string; cashierName: string;
}
export interface ReceiptFilters { from?: string; to?: string; reference?: string; token?: string }
export interface ReceiptPage {
  receipts: ReceiptSummary[]; nextCursor: string | null; from: string; to: string; today: string; timeZone: string; databaseGeneration: string;
}
async function read(url: string, signal: AbortSignal) {
  const token = PosStorage.getToken();
  let response: Response, body: any;
  try {
    response = await sessionFetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    body = await response.json();
  } catch (error) {
    if (error instanceof TypeError || (error as Error).name === 'TimeoutError') throw new Error('Receipt lookup needs the local POS server. Keep your cart and retry.');
    throw error;
  }
  if (signal.aborted || PosStorage.getToken() !== token) throw new DOMException('Receipt request cancelled.', 'AbortError');
  if (!response.ok) throw new Error(body.error || 'Could not read saved receipts. Retry when the POS server is available.');
  return body;
}
export const ReceiptsApi = {
  async search(filters: ReceiptFilters, cursor: string | null, signal: AbortSignal): Promise<ReceiptPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (cursor) params.set('cursor', cursor);
    const page = await read(`/api/receipts?${params}`, signal);
    if (!page || !Array.isArray(page.receipts)) throw new Error('Could not confirm receipt search results. Retry lookup.');
    return page;
  },
  async get(id: string, signal: AbortSignal): Promise<Order> {
    const order = await read(`/api/receipts/${encodeURIComponent(id)}`, signal);
    if (!order || order.id !== id || order.persistenceState !== 'saved' || !Array.isArray(order.items)) throw new Error('Could not confirm this saved receipt. Search again.');
    return order;
  },
};
