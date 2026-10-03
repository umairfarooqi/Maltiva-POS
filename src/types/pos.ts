export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  costPrice: number;
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
  priceDelta: number;
  costDelta: number;
}

export interface BundledProduct {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
  rawCost?: number;
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
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  notes?: string;
}

export interface SelectedVariationItem {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  costDelta: number;
}

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface Order {
  id: string;
  idempotencyKey?: string;
  persistenceState?: 'saved' | 'pending' | 'rejected' | 'draft';
  rejectionReason?: string;
  cashTendered?: number;
  changeDue?: number;
  orderNumber: string;
  tokenNumber: number;
  customerName?: string;
  tableName?: string;
  status: 'pending' | 'in_kitchen' | 'ready' | 'served' | 'cancelled';
  orderType: 'take_away' | 'dine_in';
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  totalCost: number;
  profit: number;
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
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  totalPrice: number;
  totalCost: number;
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
  storeName: string;
  tagline: string;
  address: string;
  whatsApp: string;
  taxRatePercent: number;
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
  totalSpent: number;
  lastVisit: string;
}
