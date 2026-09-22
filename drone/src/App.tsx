import React, { useEffect, useState } from 'react';
import { useSwarmSimulation } from './hooks/useSwarmSimulation';
import { RadarCanvas } from './components/RadarCanvas';
import { FleetControls } from './components/FleetControls';
import { TelemetryStats } from './components/TelemetryStats';
import { EventLogPanel } from './components/EventLogPanel';
import { ArchitectureView } from './components/ArchitectureView';
import { FleetTable } from './components/FleetTable';
import { DroneDetailModal } from './components/DroneDetailModal';
import { ProtocolBenchmarkModal } from './components/ProtocolBenchmarkModal';
import { SecurityProtocolModal } from './components/SecurityProtocolModal';
import { DatabaseArchitectureModal } from './components/DatabaseArchitectureModal';
import { GazeboSITLModal } from './components/GazeboSITLModal';
import { LightShowStudioView } from './components/lightshow/LightShowStudioView';
import { LiveDroneCockpitView } from './components/cockpit/LiveDroneCockpitView';
import { WebSerialRadioBridgeModal } from './components/production/WebSerialRadioBridgeModal';
import { RegulatoryComplianceModal } from './components/production/RegulatoryComplianceModal';
import { LightShowDashboard } from './dashboards/LightShowDashboard';
import { SurveyDashboard } from './dashboards/SurveyDashboard';
import { SurveillanceDashboard } from './dashboards/SurveillanceDashboard';
import { LinkButton } from './link/LinkButton';
import { PlatformView } from './dashboards/PlatformView';
import { RecordsView } from './dashboards/RecordsView';
import { AnalyticsView } from './dashboards/AnalyticsView';
import { ErrorBoundary } from './dashboards/ErrorBoundary';
import { recorder } from './record/recorder';
import { 
  Compass, 
  Layers, 
  Radio, 
  BarChart2, 
  FileText, 
  ShieldCheck, 
  Play, 
  Pause,
  RotateCcw,
  Sparkles,
  Lock,
  Database,
  Laptop,
  Usb,
  Scale,
  Video,
  ScanLine,
  Eye,
  Wrench,
  Sun,
  Moon,
  ChevronLeft,
  Archive,
  BarChart3,
  Keyboard,
  X
} from 'lucide-react';

/** Product verticals (operator dashboards) and the engineering views behind them. */
type VerticalTab = 'LIGHT_SHOW_OPS' | 'SURVEY_OPS' | 'SURVEILLANCE_OPS';
type EngineeringTab = 'RADAR' | 'DRONE_OPERATOR' | 'LIGHT_SHOW' | 'ARCHITECTURE' | 'TABLE';
/** 'PLATFORM' is the client-readable explanation that fronts the engineering views. */
type ViewTab = VerticalTab | EngineeringTab | 'PLATFORM' | 'RECORDS' | 'ANALYTICS';

const VERTICALS: { id: VerticalTab; label: string; icon: React.ReactNode }[] = [
  { id: 'LIGHT_SHOW_OPS', label: 'Light show', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'SURVEY_OPS', label: 'Site survey', icon: <ScanLine className="w-3.5 h-3.5" /> },
  { id: 'SURVEILLANCE_OPS', label: 'Surveillance', icon: <Eye className="w-3.5 h-3.5" /> },
];

const THEME_KEY = 'drone-command-theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('LIGHT_SHOW_OPS');
  const isVertical = activeTab === 'LIGHT_SHOW_OPS' || activeTab === 'SURVEY_OPS' || activeTab === 'SURVEILLANCE_OPS';
  const isPlatform = activeTab === 'PLATFORM';
  const isRecords = activeTab === 'RECORDS';
  const isAnalytics = activeTab === 'ANALYTICS';
  // Client-facing chrome covers the three dashboards and the "How it works" page;
  // the deep engineering views keep their original dark tooling look.
  const isClient = isVertical || isPlatform || isRecords || isAnalytics;
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showEngineering, setShowEngineering] = useState<boolean>(false);
  // Light by default (client-facing); dark for night operations. Persisted per browser.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  const [showBenchmarkModal, setShowBenchmarkModal] = useState<boolean>(false);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState<boolean>(false);
  const [showSITLModal, setShowSITLModal] = useState<boolean>(false);
  const [showWebSerialModal, setShowWebSerialModal] = useState<boolean>(false);
  const [showRegulatoryModal, setShowRegulatoryModal] = useState<boolean>(false);

  // Swarm simulation hook handling 100-500+ units in real time
  const {
    drones,
    tasks,
    alerts,
    towers,
    metrics,
    topology,
    setTopology,
    droneCount,
    setFleetScale,
    isPlaying,
    setIsPlaying,
    simulationSpeed,
    setSimulationSpeed,
    selectedDroneId,
    setSelectedDroneId,
    spawnTask,
    dispatchPresetMission,
    injectCommsSever,
    injectLowBattery,
    injectMalfunction,
    injectGpsSpoofing,
    // Security layer
    securityStatus,
    toggleEncryption,
    simulateMitmAttack,
    simulateRogueDroneAttack,
    simulateReplayAttack,
    // Database layer
    databaseEngine,
    setDatabaseEngine,
    databaseMetrics,
    // SITL simulation layer
    isSITLMode,
    sitlConfig,
    setSitlConfig,
    toggleSITLMode,
  } = useSwarmSimulation(100);

  const selectedDrone = drones.find(d => d.id === selectedDroneId) || null;

  // Operator keyboard shortcuts. An operator wearing gloves on a trackpad in the
  // dark should not have to hunt for a tab. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape') {
        // Close whatever is open, outermost last.
        setShowShortcuts(false);
        setShowBenchmarkModal(false); setShowSecurityModal(false); setShowDatabaseModal(false);
        setShowSITLModal(false); setShowWebSerialModal(false); setShowRegulatoryModal(false);
        setSelectedDroneId(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1') setActiveTab('LIGHT_SHOW_OPS');
      else if (e.key === '2') setActiveTab('SURVEY_OPS');
      else if (e.key === '3') setActiveTab('SURVEILLANCE_OPS');
      else if (e.key.toLowerCase() === 'r') setActiveTab('RECORDS');
      else if (e.key.toLowerCase() === 'a') setActiveTab('ANALYTICS');
      else if (e.key.toLowerCase() === 'h') setActiveTab('PLATFORM');
      else if (e.key === '?') setShowShortcuts(v => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelectedDroneId]);
  const selectedTask = selectedDrone?.assignedTaskId 
    ? tasks.find(t => t.id === selectedDrone.assignedTaskId)
    : undefined;

  const handleCommandRth = (droneId: string) => {
    const target = drones.find(d => d.id === droneId);
    if (target) {
      target.status = 'RTH';
      target.flightMode = 'FAILSAFE_RTH';
      target.targetX = target.homeX;
      target.targetY = target.homeY;
      target.targetZ = 20;
    }
  };

  const handleCommandEmergencyLand = (droneId: string) => {
    const target = drones.find(d => d.id === droneId);
    if (target) {
      target.status = 'EMERGENCY_LAND';
      target.targetZ = 0;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${isClient ? 'bg-bg text-ink' : 'bg-slate-950 text-slate-100'}`}>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* 1. App bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-ink text-surface flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">All in 1 · Drone Command</div>
              <div className="text-[11px] text-ink-3 truncate hidden sm:block">Light show · Site survey · Surveillance</div>
            </div>
          </div>

          {isClient ? (
            <nav id="nav-verticals" className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 max-w-full overflow-x-auto">
              {VERTICALS.map(v => (
                <button
                  key={v.id}
                  id={`nav-vertical-${v.id.toLowerCase()}`}
                  onClick={() => setActiveTab(v.id)}
                  aria-pressed={activeTab === v.id}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors ${
                    activeTab === v.id ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {v.icon}
                  <span>{v.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <button
              onClick={() => { setActiveTab('PLATFORM'); setShowEngineering(false); }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium text-ink-2 hover:text-ink border border-line"
            >
              <ChevronLeft className="w-4 h-4" />Back
            </button>
          )}

          <div className="flex items-center gap-2">
            <LinkButton />
            {isClient && (
              <button
                id="nav-analytics"
                onClick={() => setActiveTab('ANALYTICS')}
                aria-pressed={isAnalytics}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors ${
                  isAnalytics ? 'bg-accent-soft text-accent border-accent/30' : 'text-ink-2 hover:text-ink border-line'
                }`}
                title="Analytics — flight hours, products, fleet health and safety (a)"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Analytics</span>
              </button>
            )}
            {isClient && (
              <button
                id="nav-records"
                onClick={() => setActiveTab('RECORDS')}
                aria-pressed={isRecords}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors ${
                  isRecords ? 'bg-accent-soft text-accent border-accent/30' : 'text-ink-2 hover:text-ink border-line'
                }`}
                title="Flight records — every session, exportable (r)"
              >
                <Archive className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Records</span>
              </button>
            )}
            <button
              onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark (night ops)' : 'Switch to light'}
              title={theme === 'light' ? 'Dark mode for night operations' : 'Light mode'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-2 hover:text-ink"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            {isClient && (
              <button
                id="nav-engineering-toggle"
                onClick={() => setActiveTab('PLATFORM')}
                aria-pressed={isPlatform}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors ${
                  isPlatform ? 'bg-accent-soft text-accent border-accent/30' : 'text-ink-2 hover:text-ink border-line'
                }`}
                title="How the platform works, in plain language — with the engineering detail inside"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">How it works</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Engineering views keep their original dark tooling chrome */}
      {!isClient && (
        <div className="border-b border-slate-800 bg-slate-950 text-slate-100 px-4 lg:px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-tab-radar"
              onClick={() => setActiveTab('RADAR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'RADAR'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Tactical Airspace Radar</span>
            </button>

            <button
              id="nav-tab-cockpit"
              onClick={() => setActiveTab('DRONE_OPERATOR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'DRONE_OPERATOR'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Cockpit &amp; PTT GCS</span>
            </button>

            <button
              id="nav-tab-lightshow"
              onClick={() => setActiveTab('LIGHT_SHOW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'LIGHT_SHOW'
                  ? 'bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>3D Aerial Light Show (100+ Drones)</span>
            </button>

            <button
              id="nav-tab-architecture"
              onClick={() => setActiveTab('ARCHITECTURE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'ARCHITECTURE'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Software Architecture Spec</span>
            </button>

            <button
              id="nav-tab-table"
              onClick={() => setActiveTab('TABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'TABLE'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Fleet Telemetry Grid ({drones.length})</span>
            </button>
          </div>

          {/* Right Action Tools (engineering labs) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Security Quick Pill */}
            <button
              id="header-security-btn"
              onClick={() => setShowSecurityModal(true)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                securityStatus.encryptionEnabled
                  ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-700/60 text-emerald-300'
                  : 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-700/60 text-rose-300'
              }`}
              title="Inspect DTLS 1.3 Cryptography & mTLS Hierarchy"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{securityStatus.encryptionEnabled ? 'DTLS 1.3' : 'Plaintext'}</span>
            </button>

            {/* Database Storage Quick Pill */}
            <button
              id="header-database-btn"
              onClick={() => setShowDatabaseModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900/80 border border-sky-700/60 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Inspect TimescaleDB / PostGIS Ingestion Pipeline"
            >
              <Database className="w-3.5 h-3.5" />
              <span>TimescaleDB</span>
            </button>

            {/* SITL Quick Pill */}
            <button
              id="header-sitl-btn"
              onClick={() => setShowSITLModal(true)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isSITLMode
                  ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-600 text-purple-200'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="Open Headless Gazebo Harmonic & PX4 SITL Lab"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>{isSITLMode ? 'SITL Twin Active' : 'Gazebo SITL'}</span>
            </button>

            <button
              id="open-benchmark-lab"
              onClick={() => setShowBenchmarkModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Compare Zenoh vs MQTT vs DDS protocol scalability"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Benchmark Lab</span>
            </button>

            {/* Hardware WebSerial Radio Bridge Quick Pill */}
            <button
              id="header-radio-btn"
              onClick={() => setShowWebSerialModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Connect physical USB radio dongle (WebSerial API)"
            >
              <Usb className="w-3.5 h-3.5 text-sky-400" />
              <span>Radio Ingest</span>
            </button>

            {/* Regulatory Waiver Quick Pill */}
            <button
              id="header-waiver-btn"
              onClick={() => setShowRegulatoryModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-teal-950/80 hover:bg-teal-900 border border-teal-700/60 text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Generate FAA Part 107 / EASA SORA Compliance Waiver"
            >
              <Scale className="w-3.5 h-3.5 text-teal-400" />
              <span>FAA Waiver</span>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* 2. Real-time Telemetry Stats Ribbon (engineering views) */}
      {!isClient && (
        <div className="border-b border-slate-800/80 bg-slate-900/40 px-4 lg:px-6 py-2.5">
          <div className="max-w-7xl mx-auto">
            <TelemetryStats metrics={metrics} topology={topology} />
          </div>
        </div>
      )}

      {/* 3. Main Dynamic Content Area */}
      <main id="main" className={`flex-1 w-full mx-auto flex flex-col gap-6 ${isClient ? 'max-w-[1600px] px-5 py-5' : 'max-w-7xl p-4 lg:p-6'}`}>
        {/* Flight records */}
        {isRecords && (
          <ErrorBoundary name="Flight records"><RecordsView /></ErrorBoundary>
        )}

        {/* Analytics across every recorded flight */}
        {isAnalytics && (
          <ErrorBoundary name="Analytics"><AnalyticsView /></ErrorBoundary>
        )}

        {/* How it works: the client-readable front for the engineering views */}
        {isPlatform && (
          <PlatformView
            onOpenVertical={setActiveTab}
            onOpenEngineering={tab => { setShowEngineering(true); setActiveTab(tab); }}
            onOpenLab={lab => {
              if (lab === 'SECURITY') setShowSecurityModal(true);
              else if (lab === 'DATABASE') setShowDatabaseModal(true);
              else if (lab === 'SITL') setShowSITLModal(true);
              else if (lab === 'BENCHMARK') setShowBenchmarkModal(true);
              else if (lab === 'RADIO') setShowWebSerialModal(true);
              else setShowRegulatoryModal(true);
            }}
          />
        )}

        {/* VERTICAL 1: Aerial light show operator dashboard */}
        {activeTab === 'LIGHT_SHOW_OPS' && <ErrorBoundary name="Light show"><LightShowDashboard /></ErrorBoundary>}

        {/* VERTICAL 2: Site survey — mapping, 3D models and structure inspection */}
        {activeTab === 'SURVEY_OPS' && <ErrorBoundary name="Site survey"><SurveyDashboard /></ErrorBoundary>}

        {/* VERTICAL 3: Surveillance & patrol dashboard */}
        {activeTab === 'SURVEILLANCE_OPS' && <ErrorBoundary name="Surveillance"><SurveillanceDashboard /></ErrorBoundary>}

        {/* VIEW 1: Tactical Airspace Radar */}
        {activeTab === 'RADAR' && (
          <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
            {/* Left 2/3: Real-Time Radar Canvas Visualizer */}
            <div className="w-full lg:w-7/12 xl:w-2/3 flex flex-col gap-4">
              <RadarCanvas
                drones={drones}
                tasks={tasks}
                towers={towers}
                topology={topology}
                selectedDroneId={selectedDroneId}
                onSelectDrone={setSelectedDroneId}
                onSpawnTaskAtCoord={(x, y) => spawnTask(x, y)}
              />

              {/* Bottom Quick Mission Dispatch Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span className="font-semibold text-slate-200">Interactive Airspace Controls:</span>
                  <span>Click anywhere on the radar to dispatch a new mission waypoint.</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => dispatchPresetMission('SEARCH_GRID')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                  >
                    + Search Grid
                  </button>
                  <button
                    onClick={() => dispatchPresetMission('PERIMETER_SWEEP')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                  >
                    + Perimeter Ring
                  </button>
                  <button
                    onClick={() => dispatchPresetMission('CARGO_TRANSIT')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                  >
                    + Logistics Corridor
                  </button>
                </div>
              </div>
            </div>

            {/* Right 1/3: Control Panel & Live Decision Event Stream */}
            <div className="w-full lg:w-5/12 xl:w-1/3 flex flex-col gap-4">
              <FleetControls
                droneCount={droneCount}
                onSetFleetScale={setFleetScale}
                topology={topology}
                onSetTopology={setTopology}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                simulationSpeed={simulationSpeed}
                onSetSpeed={setSimulationSpeed}
                towers={towers}
                onDispatchPreset={dispatchPresetMission}
                onInjectCommsSever={injectCommsSever}
                onInjectLowBattery={injectLowBattery}
                onInjectMalfunction={injectMalfunction}
                onInjectGpsSpoofing={injectGpsSpoofing}
                onOpenSecurityModal={() => setShowSecurityModal(true)}
                onOpenDatabaseModal={() => setShowDatabaseModal(true)}
                onOpenSITLModal={() => setShowSITLModal(true)}
                isDTLSEnforced={securityStatus.encryptionEnabled}
                isSITLActive={isSITLMode}
                databaseEngine={databaseEngine}
              />

              <EventLogPanel
                alerts={alerts}
                tasks={tasks}
                onSelectDrone={setSelectedDroneId}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: Live Tactical Drone Cockpit & PTT Operator GCS */}
        {activeTab === 'DRONE_OPERATOR' && (
          <LiveDroneCockpitView />
        )}

        {/* VIEW 3: Synchronized Aerial Light Show Studio */}
        {activeTab === 'LIGHT_SHOW' && (
          <LightShowStudioView />
        )}

        {/* VIEW 3: Software Architecture Blueprint */}
        {activeTab === 'ARCHITECTURE' && (
          <ArchitectureView />
        )}

        {/* VIEW 4: Full Fleet Telemetry Grid */}
        {activeTab === 'TABLE' && (
          <FleetTable
            drones={drones}
            selectedDroneId={selectedDroneId}
            onSelectDrone={setSelectedDroneId}
          />
        )}
      </main>

      {/* 4. Modals */}
      {selectedDrone && (
        <DroneDetailModal
          drone={selectedDrone}
          assignedTask={selectedTask}
          onClose={() => setSelectedDroneId(null)}
          onCommandRth={handleCommandRth}
          onCommandEmergencyLand={handleCommandEmergencyLand}
        />
      )}

      {showBenchmarkModal && (
        <ProtocolBenchmarkModal
          droneCount={droneCount}
          onClose={() => setShowBenchmarkModal(false)}
        />
      )}

      {/* Security Protocol Lab Modal */}
      {showSecurityModal && (
        <SecurityProtocolModal
          securityStatus={securityStatus}
          onToggleEncryption={toggleEncryption}
          onSimulateMitm={simulateMitmAttack}
          onSimulateRogueDrone={simulateRogueDroneAttack}
          onSimulateReplay={simulateReplayAttack}
          onClose={() => setShowSecurityModal(false)}
        />
      )}

      {/* Database & Spatial State Architecture Modal */}
      {showDatabaseModal && (
        <DatabaseArchitectureModal
          metrics={databaseMetrics}
          selectedEngine={databaseEngine}
          onSelectEngine={setDatabaseEngine}
          droneCount={droneCount}
          onClose={() => setShowDatabaseModal(false)}
        />
      )}

      {/* Gazebo & PX4 SITL Simulation Environment Modal */}
      {showSITLModal && (
        <GazeboSITLModal
          sitlConfig={sitlConfig}
          onUpdateConfig={setSitlConfig}
          onToggleSITL={toggleSITLMode}
          droneCount={droneCount}
          onClose={() => setShowSITLModal(false)}
        />
      )}

      {/* WebSerial Radio Ingest Modal */}
      {showWebSerialModal && (
        <WebSerialRadioBridgeModal
          onClose={() => setShowWebSerialModal(false)}
        />
      )}

      {/* FAA / EASA Regulatory Compliance Modal */}
      {showRegulatoryModal && (
        <RegulatoryComplianceModal
          droneCount={droneCount}
          onClose={() => setShowRegulatoryModal(false)}
        />
      )}

      {/* 5. Footer */}
      {/* Keyboard shortcuts */}
      {showShortcuts && (
        <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={() => setShowShortcuts(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2"><Keyboard className="w-4 h-4 text-ink-3" />Keyboard shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} aria-label="Close" className="w-8 h-8 rounded-lg border border-line text-ink-2 hover:text-ink inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {[['1', 'Light show'], ['2', 'Site survey'], ['3', 'Surveillance'], ['A', 'Analytics'], ['R', 'Flight records'], ['H', 'How it works'], ['Esc', 'Close dialogs and deselect'], ['?', 'This list']].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-ink-2">{v}</span>
                  <kbd className="num rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink">{k}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <footer className={`mt-auto px-6 py-4 text-center text-[11px] ${isClient ? 'text-ink-3' : 'border-t border-slate-900 text-slate-500'}`}>
        All in 1 Events · Drone Command · FAA Part 107 / BVLOS waiver workflow ·{' '}
        <button onClick={() => setShowShortcuts(true)} className="underline hover:text-ink-2">Keyboard shortcuts</button>
      </footer>
    </div>
  );
}
