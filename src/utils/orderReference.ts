import type { Order } from '../types/pos';

/** Provisional/legacy pending snapshots must never advertise a guessed token. */
export function assignedPickupToken(order: Pick<Order, 'tokenNumber' | 'persistenceState' | 'synced'>): number | null {
  const saved = order.persistenceState === 'saved' || (!order.persistenceState && order.synced);
  return saved && Number.isSafeInteger(order.tokenNumber) && order.tokenNumber > 0 ? order.tokenNumber : null;
}
