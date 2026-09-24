import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Compass } from 'lucide-react';
import { ScrollHero } from '../dashboards/hero/ScrollHero';
import '../index.css';

/**
 * A sample of the Overview hero with another drone look, for comparing before
 * changing anything: lab/hero.html (the orange glow quad), #classic or
 * ?look=classic for the hero as shipped. The app itself is untouched.
 */
type Look = 'orange' | 'classic';
const initial = (): Look => (location.hash === '#classic' || new URLSearchParams(location.search).get('look') === 'classic' ? 'classic' : 'orange');
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';

const Sample: React.FC = () => {
  const [look, setLook] = useState<Look>(initial);
  useEffect(() => { const on = () => setLook(initial()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 h-14 flex items-center gap-3 px-4 sm:px-5 border-b border-line bg-surface/90 backdrop-blur">
        <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-ink text-bg"><Compass className="w-4 h-4" /></span>
        <span className="text-[14px] font-semibold truncate">All in 1 · Drone Command</span>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-line p-0.5 text-[12px]" role="group" aria-label="Drone look">
          {([['orange', 'Orange glow (sample)'], ['classic', 'Current hero']] as [Look, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={look === id} onClick={() => { history.replaceState(null, '', id === 'classic' ? '#classic' : '#orange'); setLook(id); }}
              className={`h-7 px-3 rounded-full ${look === id ? 'bg-ink text-bg font-medium' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
          ))}
        </div>
      </header>
      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 py-3">
        <ScrollHero key={look} look={look} onTour={() => {}} onExplore={() => {}} />
        <div className="py-24 text-center text-ink-3 text-[14px]">The rest of the Overview page continues here.</div>
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Sample />);
