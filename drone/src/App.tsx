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
import { DefenseDashboard } from './dashboards/DefenseDashboard';
import { SurveillanceDashboard } from './dashboards/SurveillanceDashboard';
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
  ShieldAlert,
  Eye,
  Wrench,
  Sun,
  Moon,
  ChevronLeft
} from 'lucide-react';

/** Product verticals (operator dashboards) and the engineering views behind them. */
type VerticalTab = 'LIGHT_SHOW_OPS' | 'DEFENSE_OPS' | 'SURVEILLANCE_OPS';
type EngineeringTab = 'RADAR' | 'DRONE_OPERATOR' | 'LIGHT_SHOW' | 'ARCHITECTURE' | 'TABLE';
type ViewTab = VerticalTab | EngineeringTab;

const VERTICALS: { id: VerticalTab; label: string; icon: React.ReactNode }[] = [
  { id: 'LIGHT_SHOW_OPS', label: 'Light show', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'DEFENSE_OPS', label: 'Defense', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { id: 'SURVEILLANCE_OPS', label: 'Surveillance', icon: <Eye className="w-3.5 h-3.5" /> },
];

const THEME_KEY = 'drone-command-theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('LIGHT_SHOW_OPS');
  const isVertical = activeTab === 'LIGHT_SHOW_OPS' || activeTab === 'DEFENSE_OPS' || activeTab === 'SURVEILLANCE_OPS';
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
    <div className={`min-h-screen flex flex-col ${isVertical ? 'bg-bg text-ink' : 'bg-slate-950 text-slate-100'}`}>
      {/* 1. App bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-ink text-surface flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">All in 1 · Drone Command</div>
              <div className="text-[11px] text-ink-3 truncate hidden sm:block">Light show · Defense · Surveillance</div>
            </div>
          </div>

          {isVertical ? (
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
              onClick={() => { setActiveTab('SURVEILLANCE_OPS'); setShowEngineering(false); }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium text-ink-2 hover:text-ink border border-line"
            >
              <ChevronLeft className="w-4 h-4" />Back to dashboards
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark (night ops)' : 'Switch to light'}
              title={theme === 'light' ? 'Dark mode for night operations' : 'Light mode'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-2 hover:text-ink"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            {isVertical && (
              <button
                id="nav-engineering-toggle"
                onClick={() => { setShowEngineering(true); setActiveTab('RADAR'); }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-ink-2 hover:text-ink border border-line"
                title="Engineering views: radar, cockpit, 3D studio, architecture, telemetry grid"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Engineering</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Engineering views keep their original dark tooling chrome */}
      {!isVertical && (
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
      {!isVertical && (
        <div className="border-b border-slate-800/80 bg-slate-900/40 px-4 lg:px-6 py-2.5">
          <div className="max-w-7xl mx-auto">
            <TelemetryStats metrics={metrics} topology={topology} />
          </div>
        </div>
      )}

      {/* 3. Main Dynamic Content Area */}
      <main className={`flex-1 w-full mx-auto flex flex-col gap-6 ${isVertical ? 'max-w-[1600px] px-5 py-5' : 'max-w-7xl p-4 lg:p-6'}`}>
        {/* VERTICAL 1: Aerial light show operator dashboard */}
        {activeTab === 'LIGHT_SHOW_OPS' && <LightShowDashboard />}

        {/* VERTICAL 2: Counter-UAS defense dashboard */}
        {activeTab === 'DEFENSE_OPS' && <DefenseDashboard />}

        {/* VERTICAL 3: Surveillance & patrol dashboard */}
        {activeTab === 'SURVEILLANCE_OPS' && <SurveillanceDashboard />}

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
      <footer className={`mt-auto px-6 py-4 text-center text-[11px] ${isVertical ? 'text-ink-3' : 'border-t border-slate-900 text-slate-500'}`}>
        All in 1 Events · Drone Command · Simulated data · FAA Part 107 / BVLOS waiver workflow
      </footer>
    </div>
  );
}
