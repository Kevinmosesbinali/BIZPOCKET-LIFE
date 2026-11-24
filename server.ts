import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { hashPassword, signSessionToken, verifyPassword } from './src/lib/auth-tokens.ts';
import { requireAuth, requireBusiness } from './src/middleware/auth.ts';
import type { AuthRequest } from './src/middleware/auth.ts';
import {
  AppError,
  createCategory,
  createExpense,
  createProduct,
  createSale,
  deleteCategory,
  deleteExpense,
  deleteProduct,
  formatMalawiDate,
  getBusinessById,
  getDashboardData,
  getReportsData,
  getSaleReceipt,
  getUserByEmail,
  getUserById,
  listCategories,
  listExpenses,
  listProducts,
  listSales,
  registerUserWithBusiness,
  setupBusinessForUser,
  updateBusinessProfile,
  updateExpense,
  updateProduct,
} from './src/db/repositories.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer'] as const;

function handleRouteError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  console.error(fallbackMessage, err);
  const message =
    err instanceof Error && err.message ? err.message : fallbackMessage;
  res.status(500).json({ error: message });
}

function parsePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseNonNegativeInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

function parsePositiveAmount(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function parseNonNegativeAmount(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint (no startup DB probe)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'bizpocket-lite' });
  });

  // Authentication Routes
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { fullName, email, password, businessName, location, phone, currency } =
        req.body ?? {};

      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        return;
      }
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }
      if (typeof businessName !== 'string' || businessName.trim().length < 2) {
        res.status(400).json({ error: 'Business name must be at least 2 characters.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const { user, business } = await registerUserWithBusiness({
        fullName,
        email,
        passwordHash,
        businessName,
        location: typeof location === 'string' ? location : 'Lilongwe, Malawi',
        phone: typeof phone === 'string' ? phone : '',
        currency: typeof currency === 'string' && currency.trim() ? currency.trim() : 'MWK',
      });

      const token = signSessionToken({
        sub: user.id,
        uid: user.uid,
        email: user.email,
      });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          businessId: user.businessId,
        },
        business,
      });
    } catch (err) {
      handleRouteError(res, err, 'Failed to register user account.');
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const business = user.businessId ? await getBusinessById(user.businessId) : null;
      const token = signSessionToken({
        sub: user.id,
        uid: user.uid,
        email: user.email,
      });

      res.json({
        token,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          businessId: user.businessId,
        },
        business,
      });
    } catch (err) {
      handleRouteError(res, err, 'Failed to sign in.');
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const auth = req.auth!;
      const user = await getUserById(auth.userId);
      if (!user) {
        res.status(404).json({ error: 'User profile not found.' });
        return;
      }
      const business = user.businessId ? await getBusinessById(user.businessId) : null;
      res.json({
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          businessId: user.businessId,
        },
        business,
      });
    } catch (err) {
      handleRouteError(res, err, 'Failed to load profile.');
    }
  });

  // Business Setup & Settings
  app.post('/api/business/setup', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const auth = req.auth!;
      const { name, ownerName, phone, location, currency } = req.body ?? {};
      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Business name must be at least 2 characters.' });
        return;
      }

      const result = await setupBusinessForUser(auth.userId, {
        name,
        ownerName: typeof ownerName === 'string' && ownerName.trim() ? ownerName : auth.fullName,
        phone: typeof phone === 'string' ? phone : '',
        location: typeof location === 'string' && location.trim() ? location : 'Lilongwe, Malawi',
        currency: typeof currency === 'string' && currency.trim() ? currency.trim() : 'MWK',
      });

      res.status(201).json({
        user: {
          id: result.user.id,
          uid: result.user.uid,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
          businessId: result.user.businessId,
        },
        business: result.business,
      });
    } catch (err) {
      handleRouteError(res, err, 'Failed to set up business profile.');
    }
  });

  app.put('/api/business', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const businessId = req.auth!.businessId!;
      const { name, ownerName, phone, location, currency, lowStockThresholdDefault } =
        req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Business name must be at least 2 characters.' });
        return;
      }
      if (typeof ownerName !== 'string' || ownerName.trim().length < 2) {
        res.status(400).json({ error: 'Owner name must be at least 2 characters.' });
        return;
      }
      const threshold =
        lowStockThresholdDefault !== undefined
          ? parseNonNegativeInt(lowStockThresholdDefault)
          : 5;
      if (threshold === null) {
        res.status(400).json({ error: 'Default low-stock threshold must be a whole number.' });
        return;
      }

      const updated = await updateBusinessProfile(businessId, {
        name,
        ownerName,
        phone: typeof phone === 'string' ? phone : '',
        location: typeof location === 'string' ? location : 'Lilongwe, Malawi',
        currency: typeof currency === 'string' && currency.trim() ? currency.trim() : 'MWK',
        lowStockThresholdDefault: threshold,
      });
      res.json(updated);
    } catch (err) {
      handleRouteError(res, err, 'Failed to update business settings.');
    }
  });

  // Categories
  app.get('/api/categories', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const rows = await listCategories(req.auth!.businessId!, type);
      res.json(rows);
    } catch (err) {
      handleRouteError(res, err, 'Failed to fetch categories.');
    }
  });

  app.post('/api/categories', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const { name, type } = req.body ?? {};
      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Category name must be at least 2 characters.' });
        return;
      }
      if (type !== 'product' && type !== 'expense') {
        res.status(400).json({ error: 'Category type must be "product" or "expense".' });
        return;
      }
      const created = await createCategory(req.auth!.businessId!, { name, type });
      res.status(201).json(created);
    } catch (err) {
      handleRouteError(res, err, 'Failed to create category.');
    }
  });

  app.delete('/api/categories/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid category ID.' });
        return;
      }
      const deleted = await deleteCategory(req.auth!.businessId!, id);
      res.json({ deleted });
    } catch (err) {
      handleRouteError(res, err, 'Failed to delete category.');
    }
  });

  // Products
  app.get('/api/products', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await listProducts(req.auth!.businessId!);
      res.json(rows);
    } catch (err) {
      handleRouteError(res, err, 'Failed to fetch products.');
    }
  });

  app.post('/api/products', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        categoryId,
        sku,
        unit,
        buyingPrice,
        sellingPrice,
        quantity,
        lowStockThreshold,
      } = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 1) {
        res.status(400).json({ error: 'Product name is required.' });
        return;
      }
      const parsedBuying = parseNonNegativeAmount(buyingPrice);
      const parsedSelling = parsePositiveAmount(sellingPrice);
      const parsedQty = parseNonNegativeInt(quantity);
      const parsedThreshold =
        lowStockThreshold !== undefined ? parseNonNegativeInt(lowStockThreshold) : 5;

      if (parsedBuying === null) {
        res.status(400).json({ error: 'Buying price must be 0 or greater.' });
        return;
      }
      if (parsedSelling === null) {
        res.status(400).json({ error: 'Selling price must be greater than 0.' });
        return;
      }
      if (parsedQty === null) {
        res.status(400).json({ error: 'Available quantity must be a non-negative whole number.' });
        return;
      }
      if (parsedThreshold === null) {
        res.status(400).json({ error: 'Low stock threshold must be a non-negative whole number.' });
        return;
      }

      let parsedCategoryId: number | null = null;
      if (categoryId !== null && categoryId !== undefined && categoryId !== '') {
        parsedCategoryId = parsePositiveInt(categoryId);
        if (!parsedCategoryId) {
          res.status(400).json({ error: 'Invalid category selection.' });
          return;
        }
      }

      const created = await createProduct(req.auth!.businessId!, {
        name,
        categoryId: parsedCategoryId,
        sku: typeof sku === 'string' ? sku : '',
        unit: typeof unit === 'string' && unit.trim() ? unit : 'pcs',
        buyingPrice: parsedBuying,
        sellingPrice: parsedSelling,
        quantity: parsedQty,
        lowStockThreshold: parsedThreshold,
      });

      res.status(201).json(created);
    } catch (err) {
      handleRouteError(res, err, 'Failed to add product.');
    }
  });

  app.put('/api/products/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid product ID.' });
        return;
      }

      const {
        name,
        categoryId,
        sku,
        unit,
        buyingPrice,
        sellingPrice,
        quantity,
        lowStockThreshold,
      } = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 1) {
        res.status(400).json({ error: 'Product name is required.' });
        return;
      }
      const parsedBuying = parseNonNegativeAmount(buyingPrice);
      const parsedSelling = parsePositiveAmount(sellingPrice);
      const parsedQty = parseNonNegativeInt(quantity);
      const parsedThreshold =
        lowStockThreshold !== undefined ? parseNonNegativeInt(lowStockThreshold) : 5;

      if (parsedBuying === null) {
        res.status(400).json({ error: 'Buying price must be 0 or greater.' });
        return;
      }
      if (parsedSelling === null) {
        res.status(400).json({ error: 'Selling price must be greater than 0.' });
        return;
      }
      if (parsedQty === null) {
        res.status(400).json({ error: 'Available quantity must be a non-negative whole number.' });
        return;
      }
      if (parsedThreshold === null) {
        res.status(400).json({ error: 'Low stock threshold must be a non-negative whole number.' });
        return;
      }

      let parsedCategoryId: number | null = null;
      if (categoryId !== null && categoryId !== undefined && categoryId !== '') {
        parsedCategoryId = parsePositiveInt(categoryId);
        if (!parsedCategoryId) {
          res.status(400).json({ error: 'Invalid category selection.' });
          return;
        }
      }

      const updated = await updateProduct(req.auth!.businessId!, id, {
        name,
        categoryId: parsedCategoryId,
        sku: typeof sku === 'string' ? sku : '',
        unit: typeof unit === 'string' && unit.trim() ? unit : 'pcs',
        buyingPrice: parsedBuying,
        sellingPrice: parsedSelling,
        quantity: parsedQty,
        lowStockThreshold: parsedThreshold,
      });

      res.json(updated);
    } catch (err) {
      handleRouteError(res, err, 'Failed to update product.');
    }
  });

  app.delete('/api/products/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid product ID.' });
        return;
      }
      const deleted = await deleteProduct(req.auth!.businessId!, id);
      res.json({ deleted });
    } catch (err) {
      handleRouteError(res, err, 'Failed to delete product.');
    }
  });

  // Sales & Receipts
  app.get('/api/sales', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const startDate =
        typeof req.query.startDate === 'string' && isValidIsoDate(req.query.startDate)
          ? req.query.startDate
          : undefined;
      const endDate =
        typeof req.query.endDate === 'string' && isValidIsoDate(req.query.endDate)
          ? req.query.endDate
          : undefined;
      const paymentMethod =
        typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined;

      const rows = await listSales(req.auth!.businessId!, {
        startDate,
        endDate,
        paymentMethod,
      });
      res.json(rows);
    } catch (err) {
      handleRouteError(res, err, 'Failed to fetch sales.');
    }
  });

  app.get('/api/sales/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid sale ID.' });
        return;
      }
      const sale = await getSaleReceipt(req.auth!.businessId!, id);
      res.json(sale);
    } catch (err) {
      handleRouteError(res, err, 'Failed to load sale receipt.');
    }
  });

  app.post('/api/sales', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const { customerName, paymentMethod, paymentReference, notes, items } =
        req.body ?? {};

      if (
        typeof paymentMethod !== 'string' ||
        !VALID_PAYMENT_METHODS.includes(paymentMethod as (typeof VALID_PAYMENT_METHODS)[number])
      ) {
        res.status(400).json({
          error: 'Payment method must be Cash, Mobile Money, or Bank Transfer.',
        });
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Select at least one product to record a sale.' });
        return;
      }

      const validatedItems: Array<{ productId: number; quantity: number }> = [];
      for (const raw of items) {
        const pid = parsePositiveInt(raw?.productId);
        const qty = parsePositiveInt(raw?.quantity);
        if (!pid || !qty) {
          res.status(400).json({
            error: 'Each sale item must have a valid product and a positive quantity.',
          });
          return;
        }
        validatedItems.push({ productId: pid, quantity: qty });
      }

      const created = await createSale(req.auth!.businessId!, req.auth!.userId, {
        customerName: typeof customerName === 'string' ? customerName : 'Walk-in Customer',
        paymentMethod: paymentMethod as 'Cash' | 'Mobile Money' | 'Bank Transfer',
        paymentReference: typeof paymentReference === 'string' ? paymentReference : '',
        notes: typeof notes === 'string' ? notes : '',
        items: validatedItems,
      });

      res.status(201).json(created);
    } catch (err) {
      handleRouteError(res, err, 'Failed to record sale.');
    }
  });

  // Expenses
  app.get('/api/expenses', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const startDate =
        typeof req.query.startDate === 'string' && isValidIsoDate(req.query.startDate)
          ? req.query.startDate
          : undefined;
      const endDate =
        typeof req.query.endDate === 'string' && isValidIsoDate(req.query.endDate)
          ? req.query.endDate
          : undefined;
      const categoryId =
        typeof req.query.categoryId === 'string' && req.query.categoryId
          ? parsePositiveInt(req.query.categoryId) ?? undefined
          : undefined;

      const rows = await listExpenses(req.auth!.businessId!, {
        startDate,
        endDate,
        categoryId,
      });
      res.json(rows);
    } catch (err) {
      handleRouteError(res, err, 'Failed to fetch expenses.');
    }
  });

  app.post('/api/expenses', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const {
        categoryId,
        categoryName,
        description,
        amount,
        paymentMethod,
        expenseDate,
      } = req.body ?? {};

      if (typeof description !== 'string' || description.trim().length < 2) {
        res.status(400).json({ error: 'Expense description must be at least 2 characters.' });
        return;
      }
      const parsedAmount = parsePositiveAmount(amount);
      if (parsedAmount === null) {
        res.status(400).json({ error: 'Expense amount must be greater than 0.' });
        return;
      }

      const resolvedDate =
        typeof expenseDate === 'string' && isValidIsoDate(expenseDate)
          ? expenseDate
          : formatMalawiDate();

      let parsedCategoryId: number | null = null;
      if (categoryId !== null && categoryId !== undefined && categoryId !== '') {
        parsedCategoryId = parsePositiveInt(categoryId);
        if (!parsedCategoryId) {
          res.status(400).json({ error: 'Invalid expense category selection.' });
          return;
        }
      }

      const created = await createExpense(req.auth!.businessId!, req.auth!.userId, {
        categoryId: parsedCategoryId,
        categoryName: typeof categoryName === 'string' ? categoryName : 'General',
        description,
        amount: parsedAmount,
        paymentMethod: typeof paymentMethod === 'string' && paymentMethod.trim() ? paymentMethod : 'Cash',
        expenseDate: resolvedDate,
      });

      res.status(201).json(created);
    } catch (err) {
      handleRouteError(res, err, 'Failed to record expense.');
    }
  });

  app.put('/api/expenses/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid expense ID.' });
        return;
      }

      const {
        categoryId,
        categoryName,
        description,
        amount,
        paymentMethod,
        expenseDate,
      } = req.body ?? {};

      if (typeof description !== 'string' || description.trim().length < 2) {
        res.status(400).json({ error: 'Expense description must be at least 2 characters.' });
        return;
      }
      const parsedAmount = parsePositiveAmount(amount);
      if (parsedAmount === null) {
        res.status(400).json({ error: 'Expense amount must be greater than 0.' });
        return;
      }
      if (typeof expenseDate !== 'string' || !isValidIsoDate(expenseDate)) {
        res.status(400).json({ error: 'Valid expense date (YYYY-MM-DD) is required.' });
        return;
      }

      let parsedCategoryId: number | null = null;
      if (categoryId !== null && categoryId !== undefined && categoryId !== '') {
        parsedCategoryId = parsePositiveInt(categoryId);
        if (!parsedCategoryId) {
          res.status(400).json({ error: 'Invalid expense category selection.' });
          return;
        }
      }

      const updated = await updateExpense(req.auth!.businessId!, id, {
        categoryId: parsedCategoryId,
        categoryName: typeof categoryName === 'string' ? categoryName : 'General',
        description,
        amount: parsedAmount,
        paymentMethod: typeof paymentMethod === 'string' && paymentMethod.trim() ? paymentMethod : 'Cash',
        expenseDate,
      });

      res.json(updated);
    } catch (err) {
      handleRouteError(res, err, 'Failed to update expense.');
    }
  });

  app.delete('/api/expenses/:id', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Invalid expense ID.' });
        return;
      }
      const deleted = await deleteExpense(req.auth!.businessId!, id);
      res.json({ deleted });
    } catch (err) {
      handleRouteError(res, err, 'Failed to delete expense.');
    }
  });

  // Dashboard
  app.get('/api/dashboard', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const data = await getDashboardData(req.auth!.businessId!);
      res.json(data);
    } catch (err) {
      handleRouteError(res, err, 'Failed to load dashboard data.');
    }
  });

  // Reports
  app.get('/api/reports', requireAuth, requireBusiness, async (req: AuthRequest, res: Response) => {
    try {
      const today = formatMalawiDate();
      const period = typeof req.query.period === 'string' ? req.query.period : 'monthly';
      let startDate =
        typeof req.query.startDate === 'string' && isValidIsoDate(req.query.startDate)
          ? req.query.startDate
          : '';
      let endDate =
        typeof req.query.endDate === 'string' && isValidIsoDate(req.query.endDate)
          ? req.query.endDate
          : today;

      if (!startDate) {
        if (period === 'daily') {
          startDate = today;
          endDate = today;
        } else if (period === 'weekly') {
          startDate = formatMalawiDate(new Date(Date.now() - 6 * 86400000));
        } else {
          startDate = `${today.slice(0, 7)}-01`;
        }
      }

      const data = await getReportsData(req.auth!.businessId!, {
        startDate,
        endDate,
      });
      res.json(data);
    } catch (err) {
      handleRouteError(res, err, 'Failed to generate report.');
    }
  });

  // Frontend Vite / Static Integration
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  return app;
}

const PORT = Number(process.env.PORT) || 3000;
createApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`BizPocket Lite server listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start BizPocket Lite server:', err);
    process.exit(1);
  });
