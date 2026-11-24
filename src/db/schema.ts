import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerName: text('owner_name').notNull(),
  phone: text('phone').notNull().default(''),
  location: text('location').notNull().default('Lilongwe, Malawi'),
  currency: text('currency').notNull().default('MWK'),
  lowStockThresholdDefault: integer('low_stock_threshold_default').notNull().default(5),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('owner'),
  businessId: integer('business_id').references(() => businesses.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('product'), // 'product' | 'expense'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: integer('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  sku: text('sku').notNull().default(''),
  unit: text('unit').notNull().default('pcs'),
  buyingPrice: numeric('buying_price', { precision: 12, scale: 2 }).notNull(),
  sellingPrice: numeric('selling_price', { precision: 12, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  receiptNumber: text('receipt_number').notNull(),
  customerName: text('customer_name').notNull().default('Walk-in Customer'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  profit: numeric('profit', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: text('payment_method').notNull(), // 'Cash' | 'Mobile Money' | 'Bank Transfer'
  notes: text('notes').notNull().default(''),
  saleDate: timestamp('sale_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  saleId: integer('sale_id')
    .references(() => sales.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id').references(() => products.id, {
    onDelete: 'set null',
  }),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitBuyingPrice: numeric('unit_buying_price', { precision: 12, scale: 2 }).notNull(),
  unitSellingPrice: numeric('unit_selling_price', { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  saleId: integer('sale_id')
    .references(() => sales.id, { onDelete: 'cascade' })
    .notNull(),
  method: text('method').notNull(), // 'Cash' | 'Mobile Money' | 'Bank Transfer'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  reference: text('reference').notNull().default(''),
  status: text('status').notNull().default('completed'),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
});

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  categoryId: integer('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  categoryName: text('category_name').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull().default('Cash'),
  expenseDate: text('expense_date').notNull(), // YYYY-MM-DD
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  categories: many(categories),
  products: many(products),
  sales: many(sales),
  expenses: many(expenses),
  payments: many(payments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  business: one(businesses, {
    fields: [users.businessId],
    references: [businesses.id],
  }),
  sales: many(sales),
  expenses: many(expenses),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  business: one(businesses, {
    fields: [categories.businessId],
    references: [businesses.id],
  }),
  products: many(products),
  expenses: many(expenses),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  saleItems: many(saleItems),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  business: one(businesses, {
    fields: [sales.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [sales.userId],
    references: [users.id],
  }),
  items: many(saleItems),
  payments: many(payments),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  business: one(businesses, {
    fields: [saleItems.businessId],
    references: [businesses.id],
  }),
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
  sale: one(sales, {
    fields: [payments.saleId],
    references: [sales.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  business: one(businesses, {
    fields: [expenses.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [expenses.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [expenses.categoryId],
    references: [categories.id],
  }),
}));
