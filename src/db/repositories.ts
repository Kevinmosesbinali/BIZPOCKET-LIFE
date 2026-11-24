import crypto from 'node:crypto';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  businesses,
  categories,
  expenses,
  payments,
  products,
  saleItems,
  sales,
  users,
} from './schema.ts';

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const MALAWI_TZ = 'Africa/Blantyre';

export function formatMalawiDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAWI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatMalawiMonth(date: Date = new Date()): string {
  return formatMalawiDate(date).slice(0, 7);
}

const DEFAULT_PRODUCT_CATEGORIES = [
  'Groceries',
  'Beverages',
  'Airtime & Mobile',
  'Hardware',
  'Personal Care',
  'Stationery',
  'Fresh Produce',
  'General Merchandise',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Stock Purchase',
  'Rent',
  'Electricity (ESCOM)',
  'Water',
  'Transport & Fuel',
  'Salaries & Wages',
  'Airtime & Internet',
  'Repairs & Maintenance',
  'Other',
];

async function seedDefaultCategoriesTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: number
) {
  const rows = [
    ...DEFAULT_PRODUCT_CATEGORIES.map((name) => ({
      businessId,
      name,
      type: 'product',
    })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      businessId,
      name,
      type: 'expense',
    })),
  ];
  await tx.insert(categories).values(rows);
}

export async function getUserById(userId: number) {
  try {
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserById:', error);
    throw new Error('Failed to retrieve user profile.', { cause: error });
  }
}

export async function getUserByEmail(email: string) {
  try {
    const normalized = email.trim().toLowerCase();
    const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserByEmail:', error);
    throw new Error('Failed to look up user account.', { cause: error });
  }
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  fullName: string
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        fullName: fullName.trim() || 'Business Owner',
        role: 'owner',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateFirebaseUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function registerUserWithBusiness(input: {
  fullName: string;
  email: string;
  passwordHash: string;
  businessName: string;
  location: string;
  phone: string;
  currency: string;
}) {
  try {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    return await db.transaction(async (tx) => {
      const [business] = await tx
        .insert(businesses)
        .values({
          name: input.businessName.trim(),
          ownerName: input.fullName.trim(),
          phone: input.phone.trim(),
          location: input.location.trim() || 'Lilongwe, Malawi',
          currency: input.currency.trim() || 'MWK',
        })
        .returning();

      await seedDefaultCategoriesTx(tx, business.id);

      const uid = `local_${crypto.randomUUID()}`;
      const [user] = await tx
        .insert(users)
        .values({
          uid,
          email: normalizedEmail,
          fullName: input.fullName.trim(),
          passwordHash: input.passwordHash,
          role: 'owner',
          businessId: business.id,
        })
        .returning();

      return { user, business };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in registerUserWithBusiness:', error);
    throw new Error('Failed to register account. Please try again.', { cause: error });
  }
}

export async function getBusinessById(businessId: number) {
  try {
    const result = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getBusinessById:', error);
    throw new Error('Failed to load business profile.', { cause: error });
  }
}

export async function setupBusinessForUser(
  userId: number,
  input: {
    name: string;
    ownerName: string;
    phone: string;
    location: string;
    currency: string;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!currentUser) {
        throw new AppError('User account not found.', 404);
      }

      if (currentUser.businessId) {
        const [existingBiz] = await tx
          .select()
          .from(businesses)
          .where(eq(businesses.id, currentUser.businessId))
          .limit(1);
        if (existingBiz) {
          return { user: currentUser, business: existingBiz };
        }
      }

      const [business] = await tx
        .insert(businesses)
        .values({
          name: input.name.trim(),
          ownerName: input.ownerName.trim() || currentUser.fullName,
          phone: input.phone.trim(),
          location: input.location.trim() || 'Lilongwe, Malawi',
          currency: input.currency.trim() || 'MWK',
        })
        .returning();

      await seedDefaultCategoriesTx(tx, business.id);

      const [updatedUser] = await tx
        .update(users)
        .set({ businessId: business.id })
        .where(eq(users.id, userId))
        .returning();

      return { user: updatedUser, business };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in setupBusinessForUser:', error);
    throw new Error('Failed to create business profile.', { cause: error });
  }
}

export async function updateBusinessProfile(
  businessId: number,
  input: {
    name: string;
    ownerName: string;
    phone: string;
    location: string;
    currency: string;
    lowStockThresholdDefault: number;
  }
) {
  try {
    const [updated] = await db
      .update(businesses)
      .set({
        name: input.name.trim(),
        ownerName: input.ownerName.trim(),
        phone: input.phone.trim(),
        location: input.location.trim(),
        currency: input.currency.trim() || 'MWK',
        lowStockThresholdDefault: input.lowStockThresholdDefault,
      })
      .where(eq(businesses.id, businessId))
      .returning();

    if (!updated) {
      throw new AppError('Business profile not found.', 404);
    }
    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in updateBusinessProfile:', error);
    throw new Error('Failed to update business profile.', { cause: error });
  }
}

// Categories
export async function listCategories(businessId: number, type?: string) {
  try {
    const conditions = [eq(categories.businessId, businessId)];
    if (type === 'product' || type === 'expense') {
      conditions.push(eq(categories.type, type));
    }
    return await db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.name));
  } catch (error) {
    console.error('Database query failed in listCategories:', error);
    throw new Error('Failed to load categories.', { cause: error });
  }
}

export async function createCategory(
  businessId: number,
  input: { name: string; type: 'product' | 'expense' }
) {
  try {
    const trimmed = input.name.trim();
    const existing = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.businessId, businessId),
          eq(categories.type, input.type),
          sql`LOWER(${categories.name}) = LOWER(${trimmed})`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('This category already exists.', 409);
    }

    const [created] = await db
      .insert(categories)
      .values({
        businessId,
        name: trimmed,
        type: input.type,
      })
      .returning();
    return created;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in createCategory:', error);
    throw new Error('Failed to create category.', { cause: error });
  }
}

export async function deleteCategory(businessId: number, categoryId: number) {
  try {
    const deleted = await db
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.businessId, businessId)))
      .returning();
    if (!deleted.length) {
      throw new AppError('Category not found.', 404);
    }
    return deleted[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in deleteCategory:', error);
    throw new Error('Failed to delete category.', { cause: error });
  }
}

// Products
export async function listProducts(businessId: number) {
  try {
    const rows = await db
      .select({
        id: products.id,
        businessId: products.businessId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        sku: products.sku,
        unit: products.unit,
        buyingPrice: products.buyingPrice,
        sellingPrice: products.sellingPrice,
        quantity: products.quantity,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.businessId, businessId))
      .orderBy(asc(products.name));

    return rows.map((row) => ({
      ...row,
      categoryName: row.categoryName ?? 'Uncategorized',
      buyingPrice: Number(row.buyingPrice),
      sellingPrice: Number(row.sellingPrice),
    }));
  } catch (error) {
    console.error('Database query failed in listProducts:', error);
    throw new Error('Failed to load products.', { cause: error });
  }
}

export async function createProduct(
  businessId: number,
  input: {
    name: string;
    categoryId: number | null;
    sku: string;
    unit: string;
    buyingPrice: number;
    sellingPrice: number;
    quantity: number;
    lowStockThreshold: number;
  }
) {
  try {
    if (input.categoryId !== null) {
      const cat = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.id, input.categoryId), eq(categories.businessId, businessId))
        )
        .limit(1);
      if (!cat.length) {
        throw new AppError('Selected category does not belong to your business.', 400);
      }
    }

    const [created] = await db
      .insert(products)
      .values({
        businessId,
        categoryId: input.categoryId,
        name: input.name.trim(),
        sku: input.sku.trim(),
        unit: input.unit.trim() || 'pcs',
        buyingPrice: input.buyingPrice.toFixed(2),
        sellingPrice: input.sellingPrice.toFixed(2),
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold,
      })
      .returning();

    return {
      ...created,
      buyingPrice: Number(created.buyingPrice),
      sellingPrice: Number(created.sellingPrice),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in createProduct:', error);
    throw new Error('Failed to create product.', { cause: error });
  }
}

export async function updateProduct(
  businessId: number,
  productId: number,
  input: {
    name: string;
    categoryId: number | null;
    sku: string;
    unit: string;
    buyingPrice: number;
    sellingPrice: number;
    quantity: number;
    lowStockThreshold: number;
  }
) {
  try {
    if (input.categoryId !== null) {
      const cat = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.id, input.categoryId), eq(categories.businessId, businessId))
        )
        .limit(1);
      if (!cat.length) {
        throw new AppError('Selected category does not belong to your business.', 400);
      }
    }

    const [updated] = await db
      .update(products)
      .set({
        categoryId: input.categoryId,
        name: input.name.trim(),
        sku: input.sku.trim(),
        unit: input.unit.trim() || 'pcs',
        buyingPrice: input.buyingPrice.toFixed(2),
        sellingPrice: input.sellingPrice.toFixed(2),
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
      .returning();

    if (!updated) {
      throw new AppError('Product not found.', 404);
    }

    return {
      ...updated,
      buyingPrice: Number(updated.buyingPrice),
      sellingPrice: Number(updated.sellingPrice),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in updateProduct:', error);
    throw new Error('Failed to update product.', { cause: error });
  }
}

export async function deleteProduct(businessId: number, productId: number) {
  try {
    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
      .returning();

    if (!deleted) {
      throw new AppError('Product not found.', 404);
    }
    return deleted;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in deleteProduct:', error);
    throw new Error('Failed to delete product.', { cause: error });
  }
}

// Sales & Receipts
export async function createSale(
  businessId: number,
  userId: number,
  input: {
    customerName: string;
    paymentMethod: 'Cash' | 'Mobile Money' | 'Bank Transfer';
    paymentReference: string;
    notes: string;
    items: Array<{ productId: number; quantity: number }>;
  }
) {
  try {
    return await db.transaction(async (tx) => {
      const mergedQuantities = new Map<number, number>();
      for (const item of input.items) {
        mergedQuantities.set(
          item.productId,
          (mergedQuantities.get(item.productId) ?? 0) + item.quantity
        );
      }

      let totalAmount = 0;
      let totalCost = 0;

      const resolvedItems: Array<{
        productId: number;
        productName: string;
        quantity: number;
        unitBuyingPrice: number;
        unitSellingPrice: number;
        subtotal: number;
      }> = [];

      for (const [productId, requestedQty] of mergedQuantities.entries()) {
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
          .limit(1);

        if (!product) {
          throw new AppError(`Product #${productId} was not found in your inventory.`, 404);
        }

        if (product.quantity < requestedQty) {
          throw new AppError(
            `Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${requestedQty}.`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }

        const updatedStock = await tx
          .update(products)
          .set({
            quantity: sql`${products.quantity} - ${requestedQty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.businessId, businessId),
              gte(products.quantity, requestedQty)
            )
          )
          .returning({ id: products.id });

        if (!updatedStock.length) {
          throw new AppError(
            `Insufficient stock for "${product.name}" due to a concurrent sale.`,
            409,
            'INSUFFICIENT_STOCK'
          );
        }

        const unitBuyingPrice = Number(product.buyingPrice);
        const unitSellingPrice = Number(product.sellingPrice);
        const subtotal = unitSellingPrice * requestedQty;
        const itemCost = unitBuyingPrice * requestedQty;

        totalAmount += subtotal;
        totalCost += itemCost;

        resolvedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: requestedQty,
          unitBuyingPrice,
          unitSellingPrice,
          subtotal,
        });
      }

      const profit = totalAmount - totalCost;
      const dateCode = formatMalawiDate().replace(/-/g, '');
      const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
      const receiptNumber = `BP-${dateCode}-${suffix}`;

      const [sale] = await tx
        .insert(sales)
        .values({
          businessId,
          userId,
          receiptNumber,
          customerName: input.customerName.trim() || 'Walk-in Customer',
          totalAmount: totalAmount.toFixed(2),
          totalCost: totalCost.toFixed(2),
          profit: profit.toFixed(2),
          paymentMethod: input.paymentMethod,
          notes: input.notes.trim(),
          saleDate: new Date(),
        })
        .returning();

      const insertedItems = await tx
        .insert(saleItems)
        .values(
          resolvedItems.map((item) => ({
            businessId,
            saleId: sale.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitBuyingPrice: item.unitBuyingPrice.toFixed(2),
            unitSellingPrice: item.unitSellingPrice.toFixed(2),
            subtotal: item.subtotal.toFixed(2),
          }))
        )
        .returning();

      const [payment] = await tx
        .insert(payments)
        .values({
          businessId,
          saleId: sale.id,
          method: input.paymentMethod,
          amount: totalAmount.toFixed(2),
          reference: input.paymentReference.trim(),
          status: 'completed',
          paidAt: new Date(),
        })
        .returning();

      return {
        ...sale,
        totalAmount: Number(sale.totalAmount),
        totalCost: Number(sale.totalCost),
        profit: Number(sale.profit),
        items: insertedItems.map((it) => ({
          ...it,
          unitBuyingPrice: Number(it.unitBuyingPrice),
          unitSellingPrice: Number(it.unitSellingPrice),
          subtotal: Number(it.subtotal),
        })),
        payment: {
          ...payment,
          amount: Number(payment.amount),
        },
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in createSale:', error);
    throw new Error('Failed to record sale. No inventory changes were saved.', {
      cause: error,
    });
  }
}

export async function listSales(
  businessId: number,
  filters?: { startDate?: string; endDate?: string; paymentMethod?: string }
) {
  try {
    const conditions = [eq(sales.businessId, businessId)];
    if (
      filters?.paymentMethod &&
      ['Cash', 'Mobile Money', 'Bank Transfer'].includes(filters.paymentMethod)
    ) {
      conditions.push(eq(sales.paymentMethod, filters.paymentMethod));
    }

    const salesRows = await db
      .select()
      .from(sales)
      .where(and(...conditions))
      .orderBy(desc(sales.saleDate), desc(sales.id));

    const filteredSales = salesRows.filter((s) => {
      const localDate = formatMalawiDate(new Date(s.saleDate));
      if (filters?.startDate && localDate < filters.startDate) return false;
      if (filters?.endDate && localDate > filters.endDate) return false;
      return true;
    });

    if (!filteredSales.length) return [];

    const allItems = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.businessId, businessId));

    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.businessId, businessId));

    const itemsBySale = new Map<number, typeof allItems>();
    for (const item of allItems) {
      const arr = itemsBySale.get(item.saleId) ?? [];
      arr.push(item);
      itemsBySale.set(item.saleId, arr);
    }

    const paymentBySale = new Map<number, (typeof allPayments)[number]>();
    for (const p of allPayments) {
      paymentBySale.set(p.saleId, p);
    }

    return filteredSales.map((s) => {
      const items = (itemsBySale.get(s.id) ?? []).map((it) => ({
        ...it,
        unitBuyingPrice: Number(it.unitBuyingPrice),
        unitSellingPrice: Number(it.unitSellingPrice),
        subtotal: Number(it.subtotal),
      }));
      const pay = paymentBySale.get(s.id);
      return {
        ...s,
        totalAmount: Number(s.totalAmount),
        totalCost: Number(s.totalCost),
        profit: Number(s.profit),
        items,
        payment: pay
          ? {
              ...pay,
              amount: Number(pay.amount),
            }
          : null,
      };
    });
  } catch (error) {
    console.error('Database query failed in listSales:', error);
    throw new Error('Failed to load sales history.', { cause: error });
  }
}

export async function getSaleReceipt(businessId: number, saleId: number) {
  try {
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
      .limit(1);

    if (!sale) {
      throw new AppError('Sale receipt not found.', 404);
    }

    const items = await db
      .select()
      .from(saleItems)
      .where(and(eq(saleItems.saleId, sale.id), eq(saleItems.businessId, businessId)));

    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.saleId, sale.id), eq(payments.businessId, businessId)))
      .limit(1);

    return {
      ...sale,
      totalAmount: Number(sale.totalAmount),
      totalCost: Number(sale.totalCost),
      profit: Number(sale.profit),
      items: items.map((it) => ({
        ...it,
        unitBuyingPrice: Number(it.unitBuyingPrice),
        unitSellingPrice: Number(it.unitSellingPrice),
        subtotal: Number(it.subtotal),
      })),
      payment: payment ? { ...payment, amount: Number(payment.amount) } : null,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in getSaleReceipt:', error);
    throw new Error('Failed to retrieve sale receipt.', { cause: error });
  }
}

// Expenses
export async function listExpenses(
  businessId: number,
  filters?: { startDate?: string; endDate?: string; categoryId?: number }
) {
  try {
    const conditions = [eq(expenses.businessId, businessId)];
    if (filters?.startDate) {
      conditions.push(gte(expenses.expenseDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(expenses.expenseDate, filters.endDate));
    }
    if (filters?.categoryId) {
      conditions.push(eq(expenses.categoryId, filters.categoryId));
    }

    const rows = await db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate), desc(expenses.id));

    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
    }));
  } catch (error) {
    console.error('Database query failed in listExpenses:', error);
    throw new Error('Failed to load expenses.', { cause: error });
  }
}

export async function createExpense(
  businessId: number,
  userId: number,
  input: {
    categoryId: number | null;
    categoryName: string;
    description: string;
    amount: number;
    paymentMethod: string;
    expenseDate: string;
  }
) {
  try {
    let resolvedCategoryName = input.categoryName.trim() || 'General';
    if (input.categoryId !== null) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.id, input.categoryId), eq(categories.businessId, businessId))
        )
        .limit(1);
      if (!cat) {
        throw new AppError('Selected expense category does not belong to your business.', 400);
      }
      resolvedCategoryName = cat.name;
    }

    const [created] = await db
      .insert(expenses)
      .values({
        businessId,
        userId,
        categoryId: input.categoryId,
        categoryName: resolvedCategoryName,
        description: input.description.trim(),
        amount: input.amount.toFixed(2),
        paymentMethod: input.paymentMethod.trim() || 'Cash',
        expenseDate: input.expenseDate,
      })
      .returning();

    return {
      ...created,
      amount: Number(created.amount),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in createExpense:', error);
    throw new Error('Failed to record expense.', { cause: error });
  }
}

export async function updateExpense(
  businessId: number,
  expenseId: number,
  input: {
    categoryId: number | null;
    categoryName: string;
    description: string;
    amount: number;
    paymentMethod: string;
    expenseDate: string;
  }
) {
  try {
    let resolvedCategoryName = input.categoryName.trim() || 'General';
    if (input.categoryId !== null) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.id, input.categoryId), eq(categories.businessId, businessId))
        )
        .limit(1);
      if (!cat) {
        throw new AppError('Selected expense category does not belong to your business.', 400);
      }
      resolvedCategoryName = cat.name;
    }

    const [updated] = await db
      .update(expenses)
      .set({
        categoryId: input.categoryId,
        categoryName: resolvedCategoryName,
        description: input.description.trim(),
        amount: input.amount.toFixed(2),
        paymentMethod: input.paymentMethod.trim() || 'Cash',
        expenseDate: input.expenseDate,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))
      .returning();

    if (!updated) {
      throw new AppError('Expense record not found.', 404);
    }

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in updateExpense:', error);
    throw new Error('Failed to update expense.', { cause: error });
  }
}

export async function deleteExpense(businessId: number, expenseId: number) {
  try {
    const [deleted] = await db
      .delete(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))
      .returning();

    if (!deleted) {
      throw new AppError('Expense record not found.', 404);
    }
    return deleted;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database query failed in deleteExpense:', error);
    throw new Error('Failed to delete expense.', { cause: error });
  }
}

// Dashboard Analytics
export async function getDashboardData(businessId: number) {
  try {
    const [allSales, allExpenses, allProducts] = await Promise.all([
      db
        .select()
        .from(sales)
        .where(eq(sales.businessId, businessId))
        .orderBy(desc(sales.saleDate), desc(sales.id)),
      db
        .select()
        .from(expenses)
        .where(eq(expenses.businessId, businessId))
        .orderBy(desc(expenses.expenseDate), desc(expenses.id)),
      db
        .select({
          id: products.id,
          name: products.name,
          quantity: products.quantity,
          lowStockThreshold: products.lowStockThreshold,
          unit: products.unit,
          sellingPrice: products.sellingPrice,
          categoryName: categories.name,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.businessId, businessId))
        .orderBy(asc(products.quantity), asc(products.name)),
    ]);

    const todayStr = formatMalawiDate();
    const currentMonthStr = formatMalawiMonth();

    let todaySalesTotal = 0;
    let todaySalesCount = 0;
    let todayGrossProfit = 0;

    for (const s of allSales) {
      const sDate = formatMalawiDate(new Date(s.saleDate));
      if (sDate === todayStr) {
        todaySalesTotal += Number(s.totalAmount);
        todayGrossProfit += Number(s.profit);
        todaySalesCount += 1;
      }
    }

    let todayExpensesTotal = 0;
    let monthExpensesTotal = 0;
    let totalExpenses = 0;

    for (const e of allExpenses) {
      const amt = Number(e.amount);
      totalExpenses += amt;
      if (e.expenseDate === todayStr) {
        todayExpensesTotal += amt;
      }
      if (e.expenseDate.startsWith(currentMonthStr)) {
        monthExpensesTotal += amt;
      }
    }

    const todayNetProfit = todayGrossProfit - todayExpensesTotal;

    const lowStockAll = allProducts.filter(
      (p) => p.quantity <= p.lowStockThreshold
    );

    // Weekly chart: last 7 days
    const weeklyMap = new Map<
      string,
      { date: string; label: string; sales: number; profit: number; expenses: number }
    >();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateKey = formatMalawiDate(d);
      const label = new Intl.DateTimeFormat('en-US', {
        timeZone: MALAWI_TZ,
        weekday: 'short',
        day: 'numeric',
      }).format(d);
      weeklyMap.set(dateKey, { date: dateKey, label, sales: 0, profit: 0, expenses: 0 });
    }

    for (const s of allSales) {
      const sDate = formatMalawiDate(new Date(s.saleDate));
      const bucket = weeklyMap.get(sDate);
      if (bucket) {
        bucket.sales += Number(s.totalAmount);
        bucket.profit += Number(s.profit);
      }
    }

    for (const e of allExpenses) {
      const bucket = weeklyMap.get(e.expenseDate);
      if (bucket) {
        bucket.expenses += Number(e.amount);
      }
    }

    // Monthly revenue chart: last 6 months
    const monthlyMap = new Map<
      string,
      { month: string; label: string; revenue: number; expenses: number; profit: number }
    >();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const monthKey = formatMalawiMonth(d);
      const label = new Intl.DateTimeFormat('en-US', {
        timeZone: MALAWI_TZ,
        month: 'short',
        year: '2-digit',
      }).format(d);
      monthlyMap.set(monthKey, {
        month: monthKey,
        label,
        revenue: 0,
        expenses: 0,
        profit: 0,
      });
    }

    for (const s of allSales) {
      const mKey = formatMalawiDate(new Date(s.saleDate)).slice(0, 7);
      const bucket = monthlyMap.get(mKey);
      if (bucket) {
        bucket.revenue += Number(s.totalAmount);
        bucket.profit += Number(s.profit);
      }
    }

    for (const e of allExpenses) {
      const mKey = e.expenseDate.slice(0, 7);
      const bucket = monthlyMap.get(mKey);
      if (bucket) {
        bucket.expenses += Number(e.amount);
        bucket.profit -= Number(e.amount);
      }
    }

    // Recent transactions (sales + expenses unified)
    const recentSalesTx = allSales.slice(0, 8).map((s) => ({
      id: `sale-${s.id}`,
      rawId: s.id,
      type: 'sale' as const,
      title: s.receiptNumber,
      subtitle: s.customerName,
      paymentMethod: s.paymentMethod,
      amount: Number(s.totalAmount),
      date: s.saleDate.toISOString(),
      displayDate: formatMalawiDate(new Date(s.saleDate)),
    }));

    const recentExpensesTx = allExpenses.slice(0, 8).map((e) => ({
      id: `expense-${e.id}`,
      rawId: e.id,
      type: 'expense' as const,
      title: e.categoryName,
      subtitle: e.description,
      paymentMethod: e.paymentMethod,
      amount: Number(e.amount),
      date: e.createdAt.toISOString(),
      displayDate: e.expenseDate,
    }));

    const recentTransactions = [...recentSalesTx, ...recentExpensesTx]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    return {
      todaySalesTotal,
      todaySalesCount,
      todayGrossProfit,
      todayExpensesTotal,
      todayNetProfit,
      totalExpenses,
      monthExpensesTotal,
      totalProducts: allProducts.length,
      lowStockCount: lowStockAll.length,
      lowStockProducts: lowStockAll.slice(0, 8).map((p) => ({
        ...p,
        categoryName: p.categoryName ?? 'Uncategorized',
        sellingPrice: Number(p.sellingPrice),
      })),
      recentTransactions,
      weeklySales: Array.from(weeklyMap.values()),
      monthlyRevenue: Array.from(monthlyMap.values()),
    };
  } catch (error) {
    console.error('Database query failed in getDashboardData:', error);
    throw new Error('Failed to load dashboard metrics.', { cause: error });
  }
}

// Reports
export async function getReportsData(
  businessId: number,
  input: {
    startDate: string;
    endDate: string;
  }
) {
  try {
    const [salesList, expenseList, productsList] = await Promise.all([
      listSales(businessId, {
        startDate: input.startDate,
        endDate: input.endDate,
      }),
      listExpenses(businessId, {
        startDate: input.startDate,
        endDate: input.endDate,
      }),
      listProducts(businessId),
    ]);

    let totalRevenue = 0;
    let totalCOGS = 0;
    let grossProfit = 0;
    const paymentBreakdownMap = new Map<string, { method: string; count: number; amount: number }>();

    const seriesMap = new Map<
      string,
      { date: string; sales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number }
    >();

    for (const s of salesList) {
      totalRevenue += s.totalAmount;
      totalCOGS += s.totalCost;
      grossProfit += s.profit;

      const pm = paymentBreakdownMap.get(s.paymentMethod) ?? {
        method: s.paymentMethod,
        count: 0,
        amount: 0,
      };
      pm.count += 1;
      pm.amount += s.totalAmount;
      paymentBreakdownMap.set(s.paymentMethod, pm);

      const dKey = formatMalawiDate(new Date(s.saleDate));
      const dayBucket = seriesMap.get(dKey) ?? {
        date: dKey,
        sales: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
      };
      dayBucket.sales += s.totalAmount;
      dayBucket.cogs += s.totalCost;
      dayBucket.grossProfit += s.profit;
      dayBucket.netProfit += s.profit;
      seriesMap.set(dKey, dayBucket);
    }

    let totalExpenses = 0;
    const expenseByCategoryMap = new Map<
      string,
      { category: string; count: number; amount: number }
    >();

    for (const e of expenseList) {
      totalExpenses += e.amount;
      const cat = expenseByCategoryMap.get(e.categoryName) ?? {
        category: e.categoryName,
        count: 0,
        amount: 0,
      };
      cat.count += 1;
      cat.amount += e.amount;
      expenseByCategoryMap.set(e.categoryName, cat);

      const dayBucket = seriesMap.get(e.expenseDate) ?? {
        date: e.expenseDate,
        sales: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
      };
      dayBucket.expenses += e.amount;
      dayBucket.netProfit -= e.amount;
      seriesMap.set(e.expenseDate, dayBucket);
    }

    const netProfit = grossProfit - totalExpenses;
    const marginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Top selling products in range
    const productPerfMap = new Map<
      string,
      { name: string; unitsSold: number; revenue: number; profit: number }
    >();
    for (const s of salesList) {
      for (const item of s.items) {
        const entry = productPerfMap.get(item.productName) ?? {
          name: item.productName,
          unitsSold: 0,
          revenue: 0,
          profit: 0,
        };
        entry.unitsSold += item.quantity;
        entry.revenue += item.subtotal;
        entry.profit += (item.unitSellingPrice - item.unitBuyingPrice) * item.quantity;
        productPerfMap.set(item.productName, entry);
      }
    }

    // Inventory summary
    let totalUnits = 0;
    let inventoryCostValue = 0;
    let inventoryRetailValue = 0;
    const lowStockItems: typeof productsList = [];
    const outOfStockItems: typeof productsList = [];

    for (const p of productsList) {
      totalUnits += p.quantity;
      inventoryCostValue += p.buyingPrice * p.quantity;
      inventoryRetailValue += p.sellingPrice * p.quantity;
      if (p.quantity === 0) {
        outOfStockItems.push(p);
      } else if (p.quantity <= p.lowStockThreshold) {
        lowStockItems.push(p);
      }
    }

    const timeSeries = Array.from(seriesMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      range: { startDate: input.startDate, endDate: input.endDate },
      salesSummary: {
        count: salesList.length,
        totalRevenue,
        totalCOGS,
        grossProfit,
        paymentBreakdown: Array.from(paymentBreakdownMap.values()),
        topProducts: Array.from(productPerfMap.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10),
      },
      expenseSummary: {
        count: expenseList.length,
        totalExpenses,
        byCategory: Array.from(expenseByCategoryMap.values()).sort(
          (a, b) => b.amount - a.amount
        ),
      },
      profitSummary: {
        revenue: totalRevenue,
        cogs: totalCOGS,
        grossProfit,
        operatingExpenses: totalExpenses,
        netProfit,
        marginPercent,
      },
      inventorySummary: {
        totalSkus: productsList.length,
        totalUnits,
        inventoryCostValue,
        inventoryRetailValue,
        potentialGrossProfit: inventoryRetailValue - inventoryCostValue,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        products: productsList,
      },
      timeSeries,
      salesList,
      expenseList,
    };
  } catch (error) {
    console.error('Database query failed in getReportsData:', error);
    throw new Error('Failed to generate reports.', { cause: error });
  }
}
