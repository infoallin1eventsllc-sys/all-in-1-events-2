import React, { useState } from 'react';
import { useLightShowSimulation } from '../../hooks/useLightShowSimulation';
import { LightShowCanvas3D } from './LightShowCanvas3D';
import { LightShowConductor } from './LightShowConductor';
import { ChoreographyEngineModal } from './ChoreographyEngineModal';
import { SyncPrecisionModal } from './SyncPrecisionModal';
import { LightShowArchitectureView } from './LightShowArchitectureView';
import { WebSerialRadioBridgeModal } from '../production/WebSerialRadioBridgeModal';
import { LaunchPadProvisioningModal } from '../production/LaunchPadProvisioningModal';
import { BlenderAddonScriptModal } from '../production/BlenderAddonScriptModal';
import { RegulatoryComplianceModal } from '../production/RegulatoryComplianceModal';
import { SHOW_FORMATIONS } from '../../data/lightShowFormations';
import { 
  Sparkles, 
  Layers, 
  Clock, 
  BookOpen, 
  Eye, 
  Usb,
  QrCode,
  FileCode,
  Scale
} from 'lucide-react';

export const LightShowStudioView: React.FC = () => {
  const {
    droneCount,
    setDroneCount,
    drones,
    liveDrones,
    selectedDroneId,
    setSelectedDroneId,
    conductorState,
    togglePlay,
    rewind,
    seek,
    selectFormation,
    armShow,
    emergencyAbort,
    showTrajectories,
    setShowTrajectories,
    showGeofence,
    setShowGeofence,
  } = useLightShowSimulation(100);

  const [activeSubTab, setActiveSubTab] = useState<'3D_STUDIO' | 'ARCHITECTURE'>('3D_STUDIO');
  const [showChoreographyModal, setShowChoreographyModal] = useState<boolean>(false);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [showWebSerialModal, setShowWebSerialModal] = useState<boolean>(false);
  const [showLaunchPadModal, setShowLaunchPadModal] = useState<boolean>(false);
  const [showBlenderModal, setShowBlenderModal] = useState<boolean>(false);
  const [showRegulatoryModal, setShowRegulatoryModal] = useState<boolean>(false);

  const activeFormation = SHOW_FORMATIONS[conductorState.activeFormationIndex] || SHOW_FORMATIONS[0];

  return (
    <div id="light-show-studio-root" className="space-y-6">
      {/* Light Show Mode Sub-Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-slate-950 font-bold shadow-lg shadow-sky-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                SYNCHRONIZED AERIAL LIGHT SHOW STUDIO
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-950 border border-sky-800 text-sky-300">
                THREE.JS WEBGL 3D
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              100–500+ Drones &bull; 1,800-Lumen RGBW Halos &bull; GPS 1PPS Sync &bull; LAPJV Hungarian Formations
            </p>
          </div>
        </div>

        {/* View Mode Switcher and Modal Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sub-tab Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveSubTab('3D_STUDIO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === '3D_STUDIO'
                  ? 'bg-sky-500 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D Live Conductor</span>
            </button>
            <button
              onClick={() => setActiveSubTab('ARCHITECTURE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'ARCHITECTURE'
                  ? 'bg-sky-500 text-slate-950 shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Full Architecture Blueprint</span>
            </button>
          </div>

          {/* Modal Trigger: Choreography Engine */}
          <button
            onClick={() => setShowChoreographyModal(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Choreography Engine</span>
          </button>

          {/* Modal Trigger: Precision Timing */}
          <button
            onClick={() => setShowSyncModal(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Clock Sync Lab</span>
          </button>

          {/* Modal Trigger: WebSerial Hardware Radio */}
          <button
            onClick={() => setShowWebSerialModal(true)}
            className="px-3 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 text-sky-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Usb className="w-3.5 h-3.5 text-sky-400" />
            <span>Hardware Radio Ingest</span>
          </button>

          {/* Modal Trigger: Launch Pad Field Provisioning */}
          <button
            onClick={() => setShowLaunchPadModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-400" />
            <span>Airfield Staging Matrix</span>
          </button>

          {/* Modal Trigger: Blender 4.x Addon */}
          <button
            onClick={() => setShowBlenderModal(true)}
            className="px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <FileCode className="w-3.5 h-3.5 text-purple-400" />
            <span>Blender 4.x Addon</span>
          </button>

          {/* Modal Trigger: Regulatory Compliance */}
          <button
            onClick={() => setShowRegulatoryModal(true)}
            className="px-3 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900 border border-teal-700/60 text-teal-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Scale className="w-3.5 h-3.5 text-teal-400" />
            <span>FAA / EASA Waiver</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubTab === '3D_STUDIO' ? (
        <div className="space-y-6">
          {/* 1. Interactive 3D Three.js WebGL Stage */}
          <LightShowCanvas3D
            drones={drones}
            live={liveDrones}
            selectedDroneId={selectedDroneId}
            onSelectDrone={setSelectedDroneId}
            showTrajectories={showTrajectories}
            showGeofence={showGeofence}
            formationName={activeFormation.name}
          />

          {/* 2. Show Playback Conductor Console */}
          <LightShowConductor
            conductorState={conductorState}
            onTogglePlay={togglePlay}
            onRewind={rewind}
            onSeek={seek}
            onSelectFormation={selectFormation}
            droneCount={droneCount}
            onSetDroneCount={setDroneCount}
            showTrajectories={showTrajectories}
            onToggleTrajectories={() => setShowTrajectories(!showTrajectories)}
            showGeofence={showGeofence}
            onToggleGeofence={() => setShowGeofence(!showGeofence)}
            onEmergencyAbort={emergencyAbort}
            onArmShow={armShow}
          />
        </div>
      ) : (
        <LightShowArchitectureView />
      )}

      {/* Choreography Engine Modal */}
      {showChoreographyModal && (
        <ChoreographyEngineModal
          droneCount={droneCount}
          currentFormationIndex={conductorState.activeFormationIndex}
          onClose={() => setShowChoreographyModal(false)}
          onSelectFormation={(idx) => {
            selectFormation(idx);
            setActiveSubTab('3D_STUDIO');
          }}
        />
      )}

      {/* Precision Timing Modal */}
      {showSyncModal && (
        <SyncPrecisionModal
          droneCount={droneCount}
          onClose={() => setShowSyncModal(false)}
        />
      )}

      {/* WebSerial Radio Bridge Modal */}
      {showWebSerialModal && (
        <WebSerialRadioBridgeModal
          onClose={() => setShowWebSerialModal(false)}
        />
      )}

      {/* Launch Pad Field Provisioning Modal */}
      {showLaunchPadModal && (
        <LaunchPadProvisioningModal
          droneCount={droneCount}
          onClose={() => setShowLaunchPadModal(false)}
        />
      )}

      {/* Blender 4.x Addon Script Modal */}
      {showBlenderModal && (
        <BlenderAddonScriptModal
          onClose={() => setShowBlenderModal(false)}
        />
      )}

      {/* FAA / EASA Regulatory Compliance Modal */}
      {showRegulatoryModal && (
        <RegulatoryComplianceModal
          droneCount={droneCount}
          onClose={() => setShowRegulatoryModal(false)}
        />
      )}
    </div>
  );
};
