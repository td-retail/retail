import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canWrite, isAdmin } from './auth.jsx';
import { ToastProvider, Icon, Loading, useApi, BusyBar } from './components/ui.jsx';
import { ROLE } from './format.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Recalls from './pages/Recalls.jsx';
import Products from './pages/Products.jsx';
import Sales from './pages/Sales.jsx';
import Import from './pages/Import.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Promotions from './pages/Promotions.jsx';
import PromotionDetail from './pages/PromotionDetail.jsx';
import Exposure from './pages/Exposure.jsx';
import ExposureSite from './pages/ExposureSite.jsx';
import Sites from './pages/Sites.jsx';
import Connectors from './pages/Connectors.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Audit from './pages/Audit.jsx';
import Profile from './pages/Profile.jsx';

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  React.useEffect(() => setOpen(false), [loc.pathname]);
  const writer = canWrite(user);
  const admin = isAdmin(user);
  const ov = useApi('/exposure/overview', [loc.pathname]);
  const issues = (ov.data || []).filter((s) => s.bad + s.to_replace + s.to_install > 0).length;
  const L = ({ to, icon, children, count, end }) => (
    <NavLink to={to} end={end}><Icon name={icon} />{children}{count ? <span className="count">{count}</span> : null}</NavLink>
  );
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><img src="/logo-light.svg" alt="Toscana Diagnostica" /><div className="app">Retail · B2C + B2B</div></div>
        <nav>
          <L to="/" icon="home" end>Dashboard</L>
          <div className="group">Clienti</div>
          <L to="/clienti" icon="users" end>Clienti e profilazione</L>
          <L to="/clienti/b2b" icon="briefcase">Aziende e strutture (B2B)</L>
          <L to="/richiami" icon="bell">Richiami periodici</L>
          <div className="group">Vendite</div>
          <L to="/prodotti" icon="package">Prestazioni e prodotti</L>
          <L to="/vendite" icon="cash">Accettazioni e vendite</L>
          {writer && <L to="/import" icon="upload">Import dai gestionali</L>}
          <div className="group">Marketing</div>
          <L to="/campagne" icon="megaphone">Campagne</L>
          <L to="/promozioni" icon="tag">Calendario promozionale</L>
          <div className="group">Retail in sede</div>
          <L to="/esposizione" icon="layers" count={issues}>Esposizione e book retail</L>
          <L to="/sedi" icon="store">Sedi del network</L>
          {admin && <>
            <div className="group">Amministrazione</div>
            <L to="/connettori" icon="plug">Connettori</L>
            <L to="/utenti" icon="user">Utenti</L>
            <L to="/impostazioni" icon="gear">Impostazioni</L>
            <L to="/audit" icon="shield">Registro attività</L>
          </>}
        </nav>
        <div className="me">
          <div className="name">{user.full_name}</div>
          <div>{ROLE[user.role]}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <NavLink to="/profilo" className="btn sm ghost" style={{ color: 'var(--teal)' }}>Profilo</NavLink>
            <button className="btn sm dark" onClick={logout}>Esci</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar"><button onClick={() => setOpen(!open)} aria-label="Menu">☰</button><img src="/logo-light.svg" alt="" /></div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clienti" element={<Customers kind="B2C" />} />
          <Route path="/clienti/b2b" element={<Customers kind="B2B" />} />
          <Route path="/clienti/:id" element={<CustomerDetail />} />
          <Route path="/richiami" element={<Recalls />} />
          <Route path="/prodotti" element={<Products />} />
          <Route path="/vendite" element={<Sales />} />
          {writer && <Route path="/import" element={<Import />} />}
          <Route path="/campagne" element={<Campaigns />} />
          <Route path="/campagne/:id" element={<CampaignDetail />} />
          <Route path="/promozioni" element={<Promotions />} />
          <Route path="/promozioni/:id" element={<PromotionDetail />} />
          <Route path="/esposizione" element={<Exposure />} />
          <Route path="/esposizione/:id" element={<ExposureSite />} />
          <Route path="/sedi" element={<Sites />} />
          {admin && <Route path="/connettori" element={<Connectors />} />}
          {admin && <Route path="/utenti" element={<Users />} />}
          {admin && <Route path="/impostazioni" element={<Settings />} />}
          {admin && <Route path="/audit" element={<Audit />} />}
          <Route path="/profilo" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { loading, user, onboarding } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (onboarding) return <Onboarding />;
  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <BusyBar />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
