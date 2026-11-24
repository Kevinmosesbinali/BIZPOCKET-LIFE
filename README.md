# BizPocket Lite

A full-stack small business management system built for small business owners in Malawi to manage daily sales, expenses, inventory, receipts, and profit analytics.

## Features

- **Dashboard**: Real-time today's sales, total expenses, today's net profit, total products, low-stock alerts, recent transactions, weekly sales/profit chart, and 6-month revenue vs. expenses chart.
- **Product & Inventory Management**: Add, edit, and delete products with custom categories, buying/selling prices, unit margins, stock counts, and low-stock alert thresholds.
- **Sales & Point of Sale**: Multi-item checkout with automatic total calculation, payment method support (**Cash**, **Mobile Money**, **Bank Transfer**), automatic atomic stock deduction, searchable sales history, and printable receipts.
- **Expense Management**: Log and categorize operating expenses (Rent, ESCOM Electricity, Water, Transport, Stock Purchases, Salaries, etc.) with date and category filters.
- **Financial & Inventory Reports**: Daily, weekly, monthly, and custom-range reports for Sales, Expenses, Profit & Loss, and Inventory Valuation, with Recharts visualizations, CSV export, and print support.
- **Authentication & Business Isolation**: Account registration, secure password hashing (`crypto.scrypt` + per-user random salt), Google Sign-In, protected API routes, and strict per-business data isolation in PostgreSQL.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide React
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Drizzle ORM & Drizzle Kit

## Database Schema

PostgreSQL tables defined in `src/db/schema.ts`:
- `businesses`
- `users`
- `categories`
- `products`
- `sales`
- `sale_items`
- `payments`
- `expenses`

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

| Variable | Description |
| --- | --- |
| `SQL_HOST` | PostgreSQL hostname or Unix socket path |
| `SQL_PORT` | PostgreSQL port (default `5432`) |
| `SQL_DB_NAME` | PostgreSQL database name |
| `SQL_USER` | Application database username |
| `SQL_PASSWORD` | Application database password |
| `SQL_ADMIN_USER` | Admin database username for schema migrations |
| `SQL_ADMIN_PASSWORD` | Admin database password for schema migrations |
| `SQL_SSL` | Set to `true` for managed remote PostgreSQL (e.g. Render PostgreSQL) |
| `SESSION_SECRET` | Secret key (min. 16 chars) for signing session tokens in production |
| `PORT` | Server port (defaults to `3000`) |

## Local Development & Database Migrations

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Push PostgreSQL schema**:
   ```bash
   npm run db:push
   ```

3. **Run development server** (Express API + Vite on port 3000):
   ```bash
   npm run dev
   ```

4. **Production build & start**:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

## Deploying to Render (with GitHub & Render PostgreSQL)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: BizPocket Lite"
   git branch -M main
   git remote add origin https://github.com/<your-username>/bizpocket-lite.git
   git push -u origin main
   ```

2. **Deploy via Render Blueprint (`render.yaml`) or Manual Setup**:
   - **Database**: Create a **Render PostgreSQL** instance (`bizpocket-db`).
   - **Web Service**: Create a **Render Web Service** connected to your GitHub repository:
     - **Build Command**: `npm install && npm run build && npm run db:push`
     - **Start Command**: `npm start`
     - **Environment Variables**:
       - `NODE_ENV=production`
       - `SQL_SSL=true`
       - `SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` (mapped from your Render PostgreSQL credentials)
       - `SESSION_SECRET` (generated random string)
