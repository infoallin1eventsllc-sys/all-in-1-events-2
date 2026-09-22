import React, { useState } from 'react';
import { LIGHT_SHOW_ARCHITECTURE, LightShowArchitectureSection } from '../../data/lightShowArchitecture';
import { 
  Sparkles, 
  Layers, 
  Clock, 
  Radio, 
  Lightbulb, 
  ShieldCheck, 
  PlaySquare, 
  Monitor, 
  Code2, 
  Check, 
  Copy 
} from 'lucide-react';

export const LightShowArchitectureView: React.FC = () => {
  const [activeSectionId, setActiveSectionId] = useState<string>(LIGHT_SHOW_ARCHITECTURE[0].id);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const activeSection = LIGHT_SHOW_ARCHITECTURE.find(s => s.id === activeSectionId) || LIGHT_SHOW_ARCHITECTURE[0];

  const getSectionIcon = (id: string) => {
    switch (id) {
      case 'fleet-management': return <Monitor className="w-4 h-4 text-sky-400" />;
      case 'choreography-engine': return <Layers className="w-4 h-4 text-indigo-400" />;
      case 'precision-timing': return <Clock className="w-4 h-4 text-emerald-400" />;
      case 'communication-architecture': return <Radio className="w-4 h-4 text-amber-400" />;
      case 'led-lighting-control': return <Lightbulb className="w-4 h-4 text-yellow-400" />;
      case 'collision-avoidance-safety': return <ShieldCheck className="w-4 h-4 text-rose-400" />;
      case 'show-playback-conductor': return <PlaySquare className="w-4 h-4 text-purple-400" />;
      case 'tech-stack-recommendation': return <Code2 className="w-4 h-4 text-cyan-400" />;
      default: return <Sparkles className="w-4 h-4 text-sky-400" />;
    }
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <div id="light-show-architecture-view" className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-sky-950 border border-sky-600 text-sky-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-mono">
                SYNCHRONIZED AERIAL DRONE LIGHT SHOW ARCHITECTURE
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Authoritative Blueprint for 100–500+ Synchronous Display Airframes &bull; Sub-Second Precision
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 font-mono text-xs font-bold">
            FAA PART 107 BVLOS COMPLIANT
          </span>
        </div>
      </div>

      {/* Main Two-Column Architectural Blueprint */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Navigation Tabs for all 8-9 pillars */}
        <div className="lg:col-span-4 flex flex-col gap-2">
          {LIGHT_SHOW_ARCHITECTURE.map((sec, idx) => {
            const isActive = sec.id === activeSectionId;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSectionId(sec.id)}
                className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-slate-900 border-sky-500 shadow-md shadow-sky-500/10'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                    {getSectionIcon(sec.id)}
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 font-bold block">
                      PILLAR 0{idx + 1} &bull; {sec.badge}
                    </span>
                    <span className={`font-semibold text-xs ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                      {sec.title}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Active Architecture Deep-Dive Content */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-6">
          {/* Header of Active Section */}
          <div className="border-b border-slate-800 pb-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px] font-mono font-bold">
                {activeSection.badge}
              </span>
              <h3 className="text-base font-bold text-slate-100 font-mono">
                {activeSection.title}
              </h3>
            </div>
            <p className="text-xs text-sky-300 font-medium">
              {activeSection.subtitle}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {activeSection.overview}
            </p>
          </div>

          {/* Key Components */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              KEY ARCHITECTURAL COMPONENTS
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeSection.keyComponents.map((comp, i) => (
                <div key={i} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-mono font-bold text-xs text-slate-200 block">
                    {comp.name}
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {comp.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Specifications Matrix */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              ENGINEERING BENCHMARKS &amp; SPECIFICATIONS
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {activeSection.technicalSpecs.map((spec, i) => (
                <div key={i} className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-500 block truncate">
                    {spec.label}
                  </span>
                  <span className="text-xs font-bold font-mono text-sky-400 mt-0.5 block">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation Code Snippet (if available) */}
          {activeSection.implementationSnippet && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                  PRODUCTION CODE IMPLEMENTATION ({activeSection.implementationSnippet.language.toUpperCase()})
                </h4>
                <button
                  onClick={() => copyCode(activeSection.implementationSnippet!.code, activeSection.id)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1.5 transition-colors"
                >
                  {copiedCodeId === activeSection.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
                <code>{activeSection.implementationSnippet.code}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
