import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AircraftLinkProvider } from './link/useAircraftLink';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AircraftLinkProvider>
      <App />
    </AircraftLinkProvider>
  </StrictMode>,
);
