import React, { useState } from 'react';
import { AlertEvent, Task } from '../types';
import { ShieldCheck, AlertTriangle, AlertOctagon, Info, CheckCircle2, Clock, ListFilter } from 'lucide-react';

interface EventLogPanelProps {
  alerts: AlertEvent[];
  tasks: Task[];
  onSelectDrone: (droneId: string | null) => void;
}

export const EventLogPanel: React.FC<EventLogPanelProps> = ({ alerts, tasks, onSelectDrone }) => {
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'TASKS'>('ALERTS');

  return (
    <div id="event-log-panel" className="bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col h-full text-xs text-slate-300 shadow-xl overflow-hidden backdrop-blur">
      {/* Tab Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <button
            id="tab-alerts"
            onClick={() => setActiveTab('ALERTS')}
            className={`px-2.5 py-1 rounded font-medium text-xs transition-colors flex items-center gap-1.5 ${
              activeTab === 'ALERTS'
                ? 'bg-slate-800 text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Telemetry Incident Log</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
              {alerts.length}
            </span>
          </button>

          <button
            id="tab-tasks"
            onClick={() => setActiveTab('TASKS')}
            className={`px-2.5 py-1 rounded font-medium text-xs transition-colors flex items-center gap-1.5 ${
              activeTab === 'TASKS'
                ? 'bg-slate-800 text-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Task Queue</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
              {tasks.filter(t => t.status !== 'COMPLETED').length}
            </span>
          </button>
        </div>

        <div className="text-[10px] font-mono text-slate-500">
          REAL-TIME STREAM
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[320px] divide-y divide-slate-800/50">
        {activeTab === 'ALERTS' ? (
          alerts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-mono text-xs">
              No anomalies detected. All fleet nodes reporting nominal.
            </div>
          ) : (
            alerts.map(evt => {
              let Icon = Info;
              let badgeColor = 'text-sky-400 bg-sky-950/60 border-sky-800/50';
              if (evt.severity === 'SUCCESS') {
                Icon = ShieldCheck;
                badgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50';
              } else if (evt.severity === 'WARNING') {
                Icon = AlertTriangle;
                badgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800/50';
              } else if (evt.severity === 'CRITICAL') {
                Icon = AlertOctagon;
                badgeColor = 'text-rose-400 bg-rose-950/60 border-rose-800/50';
              }

              return (
                <div key={evt.id} className="pt-2 first:pt-0 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`p-1 rounded border ${badgeColor}`}>
                        <Icon className="w-3 h-3" />
                      </span>
                      <span className="font-semibold text-slate-200">{evt.title}</span>
                      {evt.droneId && (
                        <button
                          onClick={() => onSelectDrone(evt.droneId || null)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono text-[10px] transition-colors"
                        >
                          {evt.droneId}
                        </button>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">{evt.timestamp}</span>
                  </div>

                  <p className="text-[11px] text-slate-400 pl-6 leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="pl-6 flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Mitigation: {evt.actionTaken}</span>
                  </div>
                </div>
              );
            })
          )
        ) : (
          tasks.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-mono text-xs">
              No tasks currently registered. Dispatch a mission preset above.
            </div>
          ) : (
            tasks.map(task => {
              const isPending = task.status === 'PENDING_AUCTION';
              const isCompleted = task.status === 'COMPLETED';

              return (
                <div key={task.id} className="pt-2 first:pt-0 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        task.priority === 'CRITICAL' 
                          ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                          : task.priority === 'HIGH' 
                            ? 'bg-amber-950 text-amber-300 border border-amber-800' 
                            : 'bg-slate-800 text-slate-300'
                      }`}>
                        {task.priority}
                      </span>
                      <span className="font-medium text-slate-200">{task.title}</span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      isCompleted 
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                        : isPending 
                          ? 'bg-yellow-950 text-yellow-300 border border-yellow-800 animate-pulse' 
                          : 'bg-sky-950 text-sky-400 border border-sky-800'
                    }`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Assigned to:</span>
                      {task.assignedDroneId ? (
                        <button
                          onClick={() => onSelectDrone(task.assignedDroneId || null)}
                          className="font-mono text-sky-300 hover:underline"
                        >
                          {task.assignedDroneId}
                        </button>
                      ) : (
                        <span className="font-mono text-amber-400">Awaiting Bid Winner...</span>
                      )}
                    </div>
                    <span className="font-mono text-slate-500">[{Math.round(task.x)}, {Math.round(task.y)}]</span>
                  </div>

                  {/* Progress bar */}
                  {!isPending && !isCompleted && (
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
};
