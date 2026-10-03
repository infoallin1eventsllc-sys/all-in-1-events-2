import React, { useEffect, useRef, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

/**
 * "Install app": puts Drone Command on the home screen / in the dock as its own
 * full-screen app with an icon, working offline (see public/sw.js).
 *
 * Chrome and Edge (Android, Windows, macOS, ChromeOS) fire `beforeinstallprompt`,
 * so the button opens the browser's own install dialog. iPhone and iPad Safari
 * have no install API — the button explains Share → Add to Home Screen instead.
 * Hidden once the app is running installed.
 */

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const InstallButton: React.FC = () => {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone);
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  useEffect(() => {
    if (!help) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setHelp(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [help]);

  if (installed) return null;
  const ios = isIOS();
  if (!prompt && !ios) return null; // browser can't install (or already offered and declined)

  const onClick = async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setPrompt(null);
    } else setHelp(h => !h);
  };

  return (
    <div ref={ref} className="relative">
      <button id="install-app" onClick={onClick} title="Install Drone Command as an app"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border border-line text-ink-2 hover:text-ink">
        <Download className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Install app</span>
      </button>
      {help && (
        <div role="dialog" aria-label="Install on iPhone or iPad" className="fixed left-3 right-3 top-[108px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[300px] rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[0_12px_40px_rgba(16,24,40,0.14)] z-50">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Add to your home screen</span>
            <button onClick={() => setHelp(false)} aria-label="Close" className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
          </div>
          <ol className="mt-2 space-y-2 text-[13px] text-ink-2">
            <li className="flex items-center gap-2"><span className="num text-ink-3">1</span>Tap <Share className="w-4 h-4 text-accent" /> <strong className="font-medium text-ink">Share</strong> in Safari's toolbar</li>
            <li className="flex items-center gap-2"><span className="num text-ink-3">2</span>Choose <SquarePlus className="w-4 h-4 text-accent" /> <strong className="font-medium text-ink">Add to Home Screen</strong></li>
            <li className="flex items-center gap-2"><span className="num text-ink-3">3</span>Open <strong className="font-medium text-ink">Drone Command</strong> from its icon</li>
          </ol>
          <p className="mt-2 text-[11px] text-ink-3">On iPhone and iPad, connect to aircraft with <strong className="font-medium">Network</strong> in the link menu — Apple doesn't allow Bluetooth or USB from web apps.</p>
        </div>
      )}
    </div>
  );
};
