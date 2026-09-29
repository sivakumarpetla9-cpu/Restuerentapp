import React, { useState, useEffect, useCallback } from 'react';
import { fetchOverview, fetchCurrentUser, logout } from './api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { SearchModal } from './components/SearchModal';

// Views
import { DashboardView } from './views/DashboardView';
import { AgentsView } from './views/AgentsView';
import { LeadsView } from './views/LeadsView';
import { QualificationView } from './views/QualificationView';
import { PipelineView } from './views/PipelineView';
import { ClientsView } from './views/ClientsView';
import { ClientDetailView } from './views/ClientDetailView';
import { ProjectsView } from './views/ProjectsView';
import { ProjectDetailView } from './views/ProjectDetailView';
import { OnboardingView } from './views/OnboardingView';
import { RequirementsView } from './views/RequirementsView';
import { MilestonesView } from './views/MilestonesView';
import { TasksView } from './views/TasksView';
import { ActivityView } from './views/ActivityView';
import { CommunicationView } from './views/CommunicationView';
import { UsersView } from './views/UsersView';
import { LoginView } from './views/LoginView';
import { PublicOrderMenuView } from './views/PublicOrderMenuView';
import { RestaurantKitchenView } from './views/RestaurantKitchenView';
import { RestaurantBillingView } from './views/RestaurantBillingView';
import { fetchBillingSettings } from './api';

export function App() {
  // Public QR Table Menu view check (bypasses staff auth requirement)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const orderMatch = pathname.match(/^\/order\/([^/]+)/);
  if (orderMatch) {
    const qrToken = decodeURIComponent(orderMatch[1]);
    return <PublicOrderMenuView qrToken={qrToken} />;
  }

  const [currentUser, setCurrentUser] = useState(null);
  const [authState, setAuthState] = useState('LOADING'); // 'LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED'
  const [billingEnabled, setBillingEnabled] = useState(false);

  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/restaurant/kitchen') return 'restaurant_kitchen';
      if (window.location.pathname === '/restaurant/billing') return 'restaurant_billing';
    }
    return 'dashboard';
  });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [overview, setOverview] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      setAuthState('LOADING');
      const res = await fetchCurrentUser();
      if (res && res.user) {
        setCurrentUser(res.user);
        setAuthState('AUTHENTICATED');
      } else {
        setCurrentUser(null);
        setAuthState('UNAUTHENTICATED');
      }
    } catch (err) {
      setCurrentUser(null);
      setAuthState('UNAUTHENTICATED');
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadDashboardData = useCallback(async () => {
    if (authState !== 'AUTHENTICATED') return;
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await fetchOverview();
      setOverview(data);
      try {
        const bRes = await fetchBillingSettings();
        setBillingEnabled(Boolean(bRes.settings?.billingEnabled));
      } catch (_) {}
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Cannot connect to local API server (port 3001). Please make sure `node server.js` is running.');
    } finally {
      setIsRefreshing(false);
    }
  }, [authState]);

  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      loadDashboardData();
    }
  }, [authState, loadDashboardData]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setCurrentUser(null);
      setAuthState('UNAUTHENTICATED');
    }
  };

  // Navigate to specific views
  const handleNavigate = (view, targetId = null) => {
    if (view === 'clients' && targetId) {
      setSelectedClientId(targetId);
      setCurrentView('client_detail');
    } else if (view === 'projects' && targetId) {
      setSelectedProjectId(targetId);
      setCurrentView('project_detail');
    } else {
      setCurrentView(view);
    }
  };

  const handleSelectClient = (id) => {
    setSelectedClientId(id);
    setCurrentView('client_detail');
  };

  const handleSelectProject = (id) => {
    setSelectedProjectId(id);
    setCurrentView('project_detail');
  };

  if (authState === 'LOADING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Initializing AI Business OS...</p>
        </div>
      </div>
    );
  }

  if (authState === 'UNAUTHENTICATED') {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthState('AUTHENTICATED');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          setCurrentView(view);
          setSelectedClientId(null);
          setSelectedProjectId(null);
        }}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        stats={overview?.kpis}
        currentUser={currentUser}
        billingEnabled={billingEnabled}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        {/* Top Header */}
        <Header
          currentView={currentView}
          onOpenSearch={() => setIsSearchOpen(true)}
          onRefresh={loadDashboardData}
          isRefreshing={isRefreshing}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Global Connection Warning Banner */}
        {error && (
          <div className="bg-rose-950/80 border-b border-rose-800 text-rose-300 px-4 py-2 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadDashboardData}
              className="text-xs font-semibold underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Main Body */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              overview={overview}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === 'agents' && <AgentsView />}

          {currentView === 'leads' && (
            <LeadsView onSelectLead={(id) => handleNavigate('leads', id)} />
          )}

          {currentView === 'qualification' && (
            <QualificationView onSelectLead={(id) => handleNavigate('leads', id)} />
          )}

          {currentView === 'pipeline' && (
            <PipelineView onSelectLead={(id) => handleNavigate('leads', id)} />
          )}

          {currentView === 'clients' && (
            <ClientsView onSelectClient={handleSelectClient} />
          )}

          {currentView === 'client_detail' && (
            <ClientDetailView
              clientId={selectedClientId}
              onBack={() => setCurrentView('clients')}
              onSelectProject={handleSelectProject}
            />
          )}

          {currentView === 'projects' && (
            <ProjectsView onSelectProject={handleSelectProject} />
          )}

          {currentView === 'project_detail' && (
            <ProjectDetailView
              projectId={selectedProjectId}
              onBack={() => setCurrentView('projects')}
              onSelectClient={handleSelectClient}
            />
          )}

          {currentView === 'onboarding' && (
            <OnboardingView onSelectClient={handleSelectClient} />
          )}

          {currentView === 'requirements' && <RequirementsView />}

          {currentView === 'milestones' && <MilestonesView />}

          {currentView === 'tasks' && <TasksView />}

          {currentView === 'communication' && <CommunicationView />}

          {currentView === 'activity' && <ActivityView />}

          {currentView === 'users' && <UsersView />}

          {currentView === 'restaurant_kitchen' && <RestaurantKitchenView currentUser={currentUser} />}

          {currentView === 'restaurant_billing' && <RestaurantBillingView currentUser={currentUser} />}
        </main>
      </div>

      {/* Global Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default App;
