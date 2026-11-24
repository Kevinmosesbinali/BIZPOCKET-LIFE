export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  businessId: number | null;
}

export interface BusinessProfile {
  id: number;
  name: string;
  ownerName: string;
  phone: string;
  location: string;
  currency: string;
  lowStockThresholdDefault: number;
  createdAt: string;
}

export interface Category {
  id: number;
  businessId: number;
  name: string;
  type: 'product' | 'expense';
  createdAt: string;
}

export interface Product {
  id: number;
  businessId: number;
  categoryId: number | null;
  categoryName: string;
  name: string;
  sku: string;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number | null;
  productName: string;
  quantity: number;
  unitBuyingPrice: number;
  unitSellingPrice: number;
  subtotal: number;
}

export interface PaymentRecord {
  id: number;
  saleId: number;
  method: 'Cash' | 'Mobile Money' | 'Bank Transfer';
  amount: number;
  reference: string;
  status: string;
  paidAt: string;
}

export interface Sale {
  id: number;
  businessId: number;
  userId: number | null;
  receiptNumber: string;
  customerName: string;
  totalAmount: number;
  totalCost: number;
  profit: number;
  paymentMethod: 'Cash' | 'Mobile Money' | 'Bank Transfer';
  notes: string;
  saleDate: string;
  createdAt: string;
  items: SaleItem[];
  payment: PaymentRecord | null;
}

export interface Expense {
  id: number;
  businessId: number;
  userId: number | null;
  categoryId: number | null;
  categoryName: string;
  description: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
  createdAt: string;
}

export interface DashboardData {
  todaySalesTotal: number;
  todaySalesCount: number;
  todayGrossProfit: number;
  todayExpensesTotal: number;
  todayNetProfit: number;
  totalExpenses: number;
  monthExpensesTotal: number;
  totalProducts: number;
  lowStockCount: number;
  lowStockProducts: Array<{
    id: number;
    name: string;
    quantity: number;
    lowStockThreshold: number;
    unit: string;
    sellingPrice: number;
    categoryName: string;
  }>;
  recentTransactions: Array<{
    id: string;
    rawId: number;
    type: 'sale' | 'expense';
    title: string;
    subtitle: string;
    paymentMethod: string;
    amount: number;
    date: string;
    displayDate: string;
  }>;
  weeklySales: Array<{
    date: string;
    label: string;
    sales: number;
    profit: number;
    expenses: number;
  }>;
  monthlyRevenue: Array<{
    month: string;
    label: string;
    revenue: number;
    expenses: number;
    profit: number;
  }>;
}

export interface ReportsData {
  range: {
    startDate: string;
    endDate: string;
  };
  salesSummary: {
    count: number;
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    paymentBreakdown: Array<{ method: string; count: number; amount: number }>;
    topProducts: Array<{
      name: string;
      unitsSold: number;
      revenue: number;
      profit: number;
    }>;
  };
  expenseSummary: {
    count: number;
    totalExpenses: number;
    byCategory: Array<{ category: string; count: number; amount: number }>;
  };
  profitSummary: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    netProfit: number;
    marginPercent: number;
  };
  inventorySummary: {
    totalSkus: number;
    totalUnits: number;
    inventoryCostValue: number;
    inventoryRetailValue: number;
    potentialGrossProfit: number;
    lowStockCount: number;
    outOfStockCount: number;
    products: Product[];
  };
  timeSeries: Array<{
    date: string;
    sales: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
  }>;
  salesList: Sale[];
  expenseList: Expense[];
}
