import React, { useState } from 'react';
import { ARCHITECTURE_LAYERS } from '../data/architectureContent';
import { ArchitectureLayer } from '../types';
import { Cpu, Radio, Compass, Shield, AlertTriangle, Layers, ChevronRight, CheckCircle, XCircle, Copy, Check, Lock, Database, Laptop } from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [selectedLayerId, setSelectedLayerId] = useState<string>('fleet-management');
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const activeLayer = ARCHITECTURE_LAYERS.find(l => l.id === selectedLayerId) || ARCHITECTURE_LAYERS[0];

  const getLayerIcon = (iconName: string) => {
    switch (iconName) {
      case 'Cpu': return <Cpu className="w-4 h-4" />;
      case 'Radio': return <Radio className="w-4 h-4" />;
      case 'Compass': return <Compass className="w-4 h-4" />;
      case 'Shield': return <Shield className="w-4 h-4" />;
      case 'AlertTriangle': return <AlertTriangle className="w-4 h-4" />;
      case 'Layers': return <Layers className="w-4 h-4" />;
      case 'Lock': return <Lock className="w-4 h-4" />;
      case 'Database': return <Database className="w-4 h-4" />;
      case 'Laptop': return <Laptop className="w-4 h-4" />;
      default: return <Cpu className="w-4 h-4" />;
    }
  };

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  return (
    <div id="architecture-blueprint-container" className="flex flex-col lg:flex-row gap-6 w-full text-slate-300">
      {/* Sidebar Navigation */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-2">
        <div className="px-3 py-2 text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
          Architecture Pillars (100–500+ Drones)
        </div>

        <div className="flex flex-col gap-1.5">
          {ARCHITECTURE_LAYERS.map((layer) => {
            const isSelected = layer.id === selectedLayerId;
            return (
              <button
                key={layer.id}
                id={`arch-tab-${layer.id}`}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-sky-950/70 border-sky-500/70 text-sky-200 shadow-lg shadow-sky-950/40'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg border ${
                    isSelected ? 'bg-sky-900/80 border-sky-700 text-sky-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    {getLayerIcon(layer.iconName)}
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-sky-400 font-bold block">PILLAR {layer.number}</span>
                    <span className="font-semibold text-xs text-slate-200 block leading-tight">{layer.name}</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-sky-400 translate-x-0.5' : 'text-slate-600'}`} />
              </button>
            );
          })}
        </div>

        {/* Global Architecture Summary Card */}
        <div className="mt-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-2">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>SYSTEM SCALING TARGETS</span>
          </div>
          <div className="space-y-1 font-mono text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Swarm Capacity:</span>
              <strong className="text-slate-200">500 Units</strong>
            </div>
            <div className="flex justify-between">
              <span>Telemetry Ingestion:</span>
              <strong className="text-slate-200">10,000 msgs/s</strong>
            </div>
            <div className="flex justify-between">
              <span>P99 Egress Jitter:</span>
              <strong className="text-slate-200">&lt; 20 ms</strong>
            </div>
            <div className="flex justify-between">
              <span>Airspace Conflict Rate:</span>
              <strong className="text-emerald-400">0 (ORCA 3D)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur flex flex-col gap-6 text-xs">
        {/* Layer Header */}
        <div className="flex flex-col gap-2 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-sky-950 text-sky-400 border border-sky-800">
              PILLAR {activeLayer.number}
            </span>
            <span className="font-mono text-xs text-slate-400">MISSION-CRITICAL SPECIFICATION</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">{activeLayer.name}</h2>
          <p className="text-sm text-sky-300/90 font-medium">{activeLayer.tagline}</p>
          <p className="text-xs text-slate-400 leading-relaxed pt-1">{activeLayer.overview}</p>
        </div>

        {/* 1. Scaling Bottleneck & Core Solution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2 text-sky-400">
              <span>Scaling Solution (100–500+ Drones)</span>
            </h4>
            <p className="text-slate-300 leading-relaxed">{activeLayer.scalingSolution}</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2 text-emerald-400">
              <span>End-to-End Data Flow Pipeline</span>
            </h4>
            <p className="text-slate-300 leading-relaxed font-mono text-[11px]">{activeLayer.dataFlowDescription}</p>
          </div>
        </div>

        {/* 2. Key Algorithms & Standards */}
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wider text-slate-400">
            Core Protocols, Data Models &amp; Algorithms
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeLayer.keyProtocolsOrAlgorithms.map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <CheckCircle className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-slate-200 font-mono text-[11px]">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Deep Dive Production Code & Configuration */}
        <div className="space-y-4 pt-2">
          <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wider text-slate-400">
            Production Implementation Snippets
          </h3>

          <div className="space-y-4">
            {activeLayer.technicalDeepDive.map((dive, idx) => (
              <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800">
                  <div>
                    <h5 className="font-semibold text-slate-200 text-xs">{dive.title}</h5>
                    <p className="text-[11px] text-slate-400">{dive.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-sky-400 uppercase">{dive.language}</span>
                    <button
                      onClick={() => handleCopyCode(dive.codeOrConfig, idx)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1 text-[10px]"
                      title="Copy snippet"
                    >
                      {copiedCodeIndex === idx ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <pre className="p-4 text-[11px] font-mono leading-relaxed overflow-x-auto text-sky-200/90 bg-slate-950">
                  <code>{dive.codeOrConfig}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Trade-off Analysis Matrix */}
        <div className="space-y-3 pt-2">
          <h3 className="font-semibold text-slate-200 text-xs uppercase tracking-wider text-slate-400">
            Engineering Trade-Off Analysis Matrix
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeLayer.tradeOffAnalysis.map((item, idx) => {
              const isRecommended = item.verdict.startsWith('RECOMMENDED');
              return (
                <div 
                  key={idx}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                    isRecommended 
                      ? 'bg-sky-950/20 border-sky-800/80' 
                      : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100 text-xs">{item.approach}</span>
                      {isRecommended ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          SELECTED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">
                          ALTERNATIVE
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">ADVANTAGES:</span>
                      <ul className="list-disc list-inside text-slate-300 text-[11px] space-y-0.5">
                        {item.pros.map((p, pi) => <li key={pi}>{p}</li>)}
                      </ul>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-rose-400 font-mono font-semibold">CONSTRAINTS &amp; DOWNSIDES:</span>
                      <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-0.5">
                        {item.cons.map((c, ci) => <li key={ci}>{c}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div className={`p-2 rounded font-mono text-[10px] ${
                    isRecommended ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {item.verdict}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
