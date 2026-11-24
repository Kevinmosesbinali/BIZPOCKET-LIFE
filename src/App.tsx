import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import { AuthPage, BusinessOnboardingPage } from './components/AuthPage.tsx';
import { AppLayout, type NavSection } from './components/AppLayout.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ProductsPage } from './pages/ProductsPage.tsx';
import { SalesPage } from './pages/SalesPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

function WorkspaceRouter() {
  const { user, business, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center font-display font-bold text-white text-sm animate-pulse">
          BP
        </div>
        <p className="mt-3 text-sm text-slate-500">Loading BizPocket Lite...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!business) {
    return <BusinessOnboardingPage />;
  }

  return (
    <AppLayout
      activeSection={activeSection}
      onNavigate={setActiveSection}
      onQuickNewSale={() => setActiveSection('sales')}
    >
      {activeSection === 'dashboard' && (
        <DashboardPage onNavigate={setActiveSection} />
      )}
      {activeSection === 'products' && <ProductsPage />}
      {activeSection === 'sales' && <SalesPage />}
      {activeSection === 'expenses' && <ExpensesPage />}
      {activeSection === 'reports' && <ReportsPage />}
      {activeSection === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <WorkspaceRouter />
      </AuthProvider>
    </ToastProvider>
  );
}
