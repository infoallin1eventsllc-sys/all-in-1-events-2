import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AircraftLinkProvider } from './link/useAircraftLink';
import { HealthProvider } from './diagnostics/useHealth';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AircraftLinkProvider>
      <HealthProvider>
        <App />
      </HealthProvider>
    </AircraftLinkProvider>
  </StrictMode>,
);

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
