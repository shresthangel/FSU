import React, { createElement, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import portalDocument from '../portal-shell.html?raw';
import { Button } from './components/ui/button.jsx';
import AccountPage from './components/AccountPage.jsx';
import HomeFeatureCards from './components/HomeFeatureCards.jsx';
import HeroActions from './components/HeroActions.jsx';
import NoticeFilters from './components/NoticeFilters.jsx';
import PortalHeader from './components/PortalHeader.jsx';
import { mountLegacyApp } from '../app.js';

const portalMarkup = portalDocument.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  ?.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<header\b[\s\S]*?<\/header>/i, '<div class="react-island" data-react-island="header"></div>')
  .replace(/<div class="hero-actions">[\s\S]*?<\/div>/i, '<div class="react-island" data-react-island="hero-actions"></div>')
  .replace(/<div class="feature-grid">[\s\S]*?<\/div>/i, '<div class="react-island" data-react-island="home-features"></div>')
  .replace(/<div class="card filter-bar">[\s\S]*?<\/div>/i, '<div class="react-island" data-react-island="notice-filters"></div>')
  .replace(/<!-- ================= ACCOUNT ================= -->[\s\S]*?(?=<!-- ================= COMPLAINTS ================= -->)/i, '<div class="react-island" data-react-island="account"></div>');

export default function App() {
  useEffect(() => {
    if (!portalMarkup) return undefined;

    const islands = [
      ['header', PortalHeader],
      ['hero-actions', HeroActions],
      ['home-features', HomeFeatureCards],
      ['notice-filters', NoticeFilters],
      ['account', AccountPage],
    ].map(([name, Component]) => {
      const container = document.querySelector(`[data-react-island="${name}"]`);
      if (!container) throw new Error(`Missing React UI island: ${name}`);
      return { root: createRoot(container), Component };
    });

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      flushSync(() => {
        islands.forEach(({ root, Component }) => root.render(createElement(Component)));
      });
      mountLegacyApp();
    });

    return () => {
      active = false;
      islands.forEach(({ root }) => root.unmount());
    };
  }, []);

  if (!portalMarkup) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">The campus portal could not be loaded.</h1>
        <Button onClick={() => window.location.reload()}>Reload portal</Button>
      </main>
    );
  }

  return (
    <div
      className="react-root min-h-screen antialiased"
    >
      <div className="portal-fragment" dangerouslySetInnerHTML={{ __html: portalMarkup }} />
    </div>
  );
}
