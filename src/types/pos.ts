export interface Product {
  moneySchemaVersion?: 2;
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  pricePaisa: number;
  costPricePaisa: number;
  stockQuantity: number;
  minStockThreshold: number;
  image: string;
  description: string;
  isAvailable: boolean;
  isDeal: boolean;
  variations: VariationGroup[];
  bundledProducts: BundledProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface VariationGroup {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  options: VariationOption[];
}

export interface VariationOption {
  id: string;
  name: string;
  priceDeltaPaisa: number;
  costDeltaPaisa: number;
}

export interface BundledProduct {
  productId?: string;
  productName: string;
  quantity: number;
  unitPricePaisa?: number;
  rawCostPaisa?: number;
}

export type DealBundleItem = BundledProduct;

export interface Category {
  id: string;
  name: string;
  icon: string;
  itemCount: number;
  order: number;
}

export interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  selectedVariations: SelectedVariationItem[];
  unitPricePaisa: number;
  unitCostPaisa: number;
  totalPricePaisa: number;
  totalCostPaisa: number;
  notes?: string;
}

export interface SelectedVariationItem {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaisa: number;
  costDeltaPaisa: number;
}

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface Order {
  moneySchemaVersion?: 2;
  pricingFingerprint?: string;
  netRevenuePaisa?: number;
  marginBp?: number;
  taxBp?: number;
  taxInclusive?: boolean;
  profitIncomplete?: boolean;
  legacyDerived?: boolean;
  id: string;
  idempotencyKey?: string;
  persistenceState?: 'saved' | 'pending' | 'rejected' | 'draft';
  rejectionReason?: string;
  cashTenderedPaisa?: number;
  changeDuePaisa?: number;
  orderNumber: string;
  tokenNumber: number;
  customerName?: string;
  tableName?: string;
  status: 'pending' | 'in_kitchen' | 'ready' | 'served' | 'cancelled';
  orderType: 'take_away' | 'dine_in';
  items: OrderItem[];
  subtotalPaisa: number;
  taxPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  totalCostPaisa: number;
  profitPaisa: number;
  profitMarginPercent: number;
  paymentMethod: PaymentMethod;
  cashierId: string;
  cashierName: string;
  cashierRole: UserRole;
  createdAt: string;
  synced: boolean;
  offlineQueueId?: string;
  tableId?: string;
  guestCount?: number;
}

export interface OrderItem {
  netRevenuePaisa?: number;
  lineDiscountPaisa?: number;
  categoryId?: string;
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  unitPricePaisa: number;
  unitCostPaisa: number;
  quantity: number;
  totalPricePaisa: number;
  totalCostPaisa: number;
  selectedVariations: SelectedVariationItem[];
  notes?: string;
  bundledProducts?: BundledProduct[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password?: string;
  pin?: string;
  role: UserRole;
  avatar: string;
  active: boolean;
  branch: string;
  securityQuestion?: string;
  securityAnswer?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'online' | 'mixed' | 'scan';

export interface PrinterSettings {
  moneySchemaVersion?: 2;
  taxInclusive?: boolean;
  storeName: string;
  tagline: string;
  address: string;
  whatsApp: string;
  taxBp: number;
  paperWidth: '80mm' | '58mm';
  autoPrintDualSlips: boolean;
  customerDisplayGreeting: string;
  // Professional Additions
  voidOrderPermission?: 'admin' | 'manager' | 'cashier';
  enableShiftTracking?: boolean;
  globalLowStockThreshold?: number;
  kitchenPrinterEnabled?: boolean;
  printerName?: string;
  printCustomerSlip?: boolean;
  printKitchenSlip?: boolean;
  restaurantName?: string;
  subtitle?: string;
  branchName?: string;
  phone?: string;
  taxId?: string;
  taxRegistrationNumber?: string;
  headerMessage?: string;
  footerMessage?: string;
  enableCustomerDisplay?: boolean;
  dualScreenCustomerDisplay?: boolean;
  customerWelcomeText?: string;
  autoPrintReceipt?: boolean;
  autoPrintKitchenOrder?: boolean;
  cashierUsername?: string;
  cashierPin?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  previousStock: number;
  changeAmount: number;
  newStock: number;
  type: 'sale' | 'restock' | 'adjustment' | 'waste';
  reason: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface TableItem {
  id: string;
  tableNumber?: string;
  number?: number | string;
  capacity: number;
  status: 'available' | 'occupied' | 'cleaning' | 'reserved';
  currentOrderId?: string;
  currentOrderNumber?: string;
  guestCount?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalOrders: number;
  totalSpentPaisa: number;
  lastVisit: string;
}
