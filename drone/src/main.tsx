import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AircraftLinkProvider } from './link/useAircraftLink';
import { HealthProvider } from './diagnostics/useHealth';
import { OperatorProvider } from './operator/operator';
import { recorder } from './record/recorder';
import { seedDemo } from './demo/seed';
import * as sync from './sync/sync';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AircraftLinkProvider>
      <HealthProvider>
        <OperatorProvider>
          <App />
        </OperatorProvider>
      </HealthProvider>
    </AircraftLinkProvider>
  </StrictMode>,
);

// Server copy (only when configured): pick up an email sign-in, queue every closed flight.
if (sync.enabled()) {
  sync.consumeRedirect();
  recorder.onClosed(id => sync.queue.add({ kind: 'session', id }));
  void sync.flush();
}

// Tidy sessions a reload left open, then give a first-time visitor the demo content.
void recorder.recoverOrphans().then(() => seedDemo());

/*
 * Offline resilience (public/sw.js): a reload at a venue with no signal still
 * opens the console. Registered after load so it never delays first paint, and
 * failures are ignored — an unavailable service worker must not break the app
 * (it is blocked in some embedded contexts and in private mode).
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* offline support unavailable here; the app works online */ });
  });
}
