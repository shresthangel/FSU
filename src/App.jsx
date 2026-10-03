import React, { useEffect } from 'react';
import portalDocument from '../portal-shell.html?raw';
import { Button } from './components/ui/button.jsx';
import { mountLegacyApp } from '../app.js';

const portalMarkup = portalDocument.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  ?.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

export default function App() {
  useEffect(() => {
    if (portalMarkup) mountLegacyApp();
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
      dangerouslySetInnerHTML={{ __html: portalMarkup }}
    />
  );
}
