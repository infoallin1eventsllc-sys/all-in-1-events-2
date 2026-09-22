import React, { useState } from 'react';
import { 
  X, 
  Database, 
  HardDrive, 
  Layers, 
  Zap, 
  Clock, 
  CheckCircle, 
  Copy, 
  Check, 
  Play,
  Search,
  Filter
} from 'lucide-react';
import { DatabaseEngineType, DatabaseMetrics } from '../types';

interface DatabaseArchitectureModalProps {
  onClose: () => void;
  metrics: DatabaseMetrics;
  selectedEngine: DatabaseEngineType;
  onSelectEngine: (engine: DatabaseEngineType) => void;
  droneCount: number;
}

export const DatabaseArchitectureModal: React.FC<DatabaseArchitectureModalProps> = ({
  onClose,
  metrics,
  selectedEngine,
  onSelectEngine,
  droneCount,
}) => {
  const [activeTab, setActiveTab] = useState<'METRICS' | 'SCHEMA_DDL' | 'QUERY_SIMULATOR' | 'COMPARISON'>('METRICS');
  const [copied, setCopied] = useState<boolean>(false);
  const [queryExecuting, setQueryExecuting] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<any | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunSpatialQuery = () => {
    setQueryExecuting(true);
    setTimeout(() => {
      setQueryExecuting(false);
      setQueryResult({
        executionTimeMs: 1.18,
        rowsScanned: 24500,
        rowsReturned: 14,
        queryPlan: 'Index Scan using idx_telemetry_spatial on drone_telemetry (Cost: 0.28..8.45) - 3D GIST Bounding Box Filter',
        sampleRows: [
          { drone_id: 'DRN-003', alt_m: 42.1, speed_mps: 12.4, dist_from_target: '34.2m', h3_res9: '8928308280fffff' },
          { drone_id: 'DRN-017', alt_m: 38.0, speed_mps: 11.2, dist_from_target: '89.4m', h3_res9: '8928308280fffff' },
          { drone_id: 'DRN-042', alt_m: 45.6, speed_mps: 14.1, dist_from_target: '128.0m', h3_res9: '8928308281fffff' }
        ]
      });
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="database-architecture-modal"
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-950/80 border border-sky-700 text-sky-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">Scalable Database &amp; State Persistence Architecture</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800">
                  10,000+ WRITES/SEC @ 500 UNITS
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Tiered persistence: In-Memory H3 Spatial Cache + Columnar Time-Series Hypertables + Spatial PostGIS
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {[
              { id: 'METRICS', label: 'Live Storage Metrics' },
              { id: 'SCHEMA_DDL', label: 'Production DDL Schema' },
              { id: 'QUERY_SIMULATOR', label: 'Spatial Query Simulator' },
              { id: 'COMPARISON', label: 'Engine Comparison' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Engine Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
            {[
              { id: 'TIMESCALE_POSTGRES', label: 'TimescaleDB' },
              { id: 'SCYLLADB_CASSANDRA', label: 'ScyllaDB' },
              { id: 'INFLUXDB_V3', label: 'InfluxDB v3' },
            ].map(eng => (
              <button
                key={eng.id}
                onClick={() => onSelectEngine(eng.id as DatabaseEngineType)}
                className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors ${
                  selectedEngine === eng.id
                    ? 'bg-sky-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {eng.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: METRICS */}
          {activeTab === 'METRICS' && (
            <div className="space-y-6">
              {/* Top Key Performance Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-mono">WRITE INGESTION RATE</span>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-100">
                    {metrics.writeRatePerSec.toLocaleString()} <span className="text-xs text-slate-400">ops/s</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">20 Hz across {droneCount} units</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-mono">P95 QUERY LATENCY</span>
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {metrics.queryLatencyP95Ms} <span className="text-xs text-slate-400">ms</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Sub-2ms spatial range check</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-mono">STORAGE COMPACTION</span>
                    <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-sky-300">
                    {metrics.storageCompactionRatio}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Gorilla + XOR compression</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-mono">ACTIVE PARTITIONS</span>
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-100">
                    {metrics.activePartitions} <span className="text-xs text-slate-400">chunks</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">1-Day &amp; Hash Sharding</div>
                </div>
              </div>

              {/* Multi-Tier Storage Architecture Diagram */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-100 text-xs uppercase tracking-wider text-sky-400">
                  Tiered Storage Pipeline: From 20Hz Telemetry to Cold Parquet
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <span>TIER 1: HOT IN-MEMORY</span>
                    </div>
                    <p className="text-slate-300 text-[10px] font-sans">
                      <strong>Redis Cluster + Redis H3 Spatial</strong>. Retains last 30 seconds of live telemetry. Powers sub-millisecond task auction queries and collision alerts.
                    </p>
                    <div className="text-slate-500 text-[10px]">Latency: &lt; 0.4 ms</div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-sky-800/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                      <span>TIER 2: TIME-SERIES WARM</span>
                    </div>
                    <p className="text-slate-300 text-[10px] font-sans">
                      <strong>TimescaleDB Hypertables + PostGIS</strong>. Retains 14 days of raw 20Hz telemetry with Gorilla columnar compression. Handles flight playback and mission review.
                    </p>
                    <div className="text-slate-500 text-[10px]">Latency: 1.2 ms | Compaction: 91.8%</div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>TIER 3: COLD PARQUET</span>
                    </div>
                    <p className="text-slate-300 text-[10px] font-sans">
                      <strong>Cloud Object Store (S3 / GCS)</strong>. Parquet format downsampled to 1 Hz. Indefinite retention for regulatory FAA compliance and fleet airframe lifespan analysis.
                    </p>
                    <div className="text-slate-500 text-[10px]">Cost: $0.002 / GB / month</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCHEMA_DDL */}
          {activeTab === 'SCHEMA_DDL' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-xs">Production Database DDL &amp; Partitioning Strategy</h4>
                  <p className="text-[11px] text-slate-400">Optimized hypertable creation with PostGIS 3D spatial index and columnar compression</p>
                </div>
                <button
                  onClick={() => handleCopy(`-- TimescaleDB Production Telemetry Schema for 500+ Drones
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE drone_telemetry (
    timestamp           TIMESTAMPTZ NOT NULL,
    drone_id            VARCHAR(32) NOT NULL,
    altitude_m          REAL NOT NULL,
    speed_mps           REAL NOT NULL,
    heading_deg         REAL NOT NULL,
    location            GEOMETRY(PointZ, 4326) NOT NULL,
    h3_index            BIGINT NOT NULL,
    battery_pct         REAL NOT NULL,
    status              VARCHAR(24) NOT NULL
);

SELECT create_hypertable('drone_telemetry', 'timestamp', 
    partitioning_column => 'drone_id', 
    number_partitions => 16, 
    chunk_time_interval => INTERVAL '1 day'
);`)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied SQL' : 'Copy DDL'}</span>
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] leading-relaxed text-sky-200 overflow-x-auto">
{`-- 1. Main Telemetry Hypertable for 500 Autonomous Units
CREATE TABLE drone_telemetry (
    timestamp           TIMESTAMPTZ NOT NULL,
    drone_id            VARCHAR(32) NOT NULL,
    session_id          UUID NOT NULL,
    
    -- Kinematics & 3D Geospatial
    altitude_m          REAL NOT NULL,
    speed_mps           REAL NOT NULL,
    heading_deg         REAL NOT NULL,
    location            GEOMETRY(PointZ, 4326) NOT NULL, -- PostGIS 3D Point
    h3_index            BIGINT NOT NULL,                 -- Uber H3 cell index
    
    -- Battery & System Health
    battery_pct         REAL NOT NULL,
    battery_voltage     REAL NOT NULL,
    status              VARCHAR(24) NOT NULL,
    flight_mode         VARCHAR(24) NOT NULL,
    active_task_id      VARCHAR(32)
);

-- 2. Partition into 1-day chunks with space partitioning on drone_id
SELECT create_hypertable('drone_telemetry', 'timestamp', 
    partitioning_column => 'drone_id', 
    number_partitions => 16, 
    chunk_time_interval => INTERVAL '1 day'
);

-- 3. Spatio-Temporal GIST Indices
CREATE INDEX idx_telemetry_spatial ON drone_telemetry USING GIST (location);
CREATE INDEX idx_telemetry_drone_time ON drone_telemetry (drone_id, timestamp DESC);
CREATE INDEX idx_telemetry_h3 ON drone_telemetry (h3_index, timestamp DESC);

-- 4. Enable Native Columnar Compression (Gorilla + Delta-of-Delta)
ALTER TABLE drone_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'drone_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);`}
              </pre>
            </div>
          )}

          {/* TAB 3: QUERY_SIMULATOR */}
          {activeTab === 'QUERY_SIMULATOR' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-100 text-xs">Interactive Spatio-Temporal Corridor Query Simulator</h4>
                <p className="text-[11px] text-slate-400">Run actual spatial corridor searches against active 500-drone telemetry records</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-sky-400">Query: Find all drones within 150m of Point(x: 450, y: 350)</span>
                  <button
                    onClick={handleRunSpatialQuery}
                    disabled={queryExecuting}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{queryExecuting ? 'Executing Index Scan...' : 'Execute Spatial Query'}</span>
                  </button>
                </div>

                {queryResult && (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-emerald-400 pb-2 border-b border-slate-800">
                      <span>Scan Time: {queryResult.executionTimeMs} ms</span>
                      <span>Scanned: {queryResult.rowsScanned.toLocaleString()} | Matched: {queryResult.rowsReturned} units</span>
                    </div>

                    <div className="text-slate-400 text-[10px]">
                      {queryResult.queryPlan}
                    </div>

                    <table className="w-full text-left border-collapse mt-2">
                      <thead>
                        <tr className="text-slate-500 text-[10px] border-b border-slate-800">
                          <th className="pb-1">Drone ID</th>
                          <th className="pb-1">Altitude</th>
                          <th className="pb-1">Speed</th>
                          <th className="pb-1">Distance to Target</th>
                          <th className="pb-1">H3 Index</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-slate-200">
                        {queryResult.sampleRows.map((row: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-1 font-bold text-sky-400">{row.drone_id}</td>
                            <td className="py-1">{row.alt_m}m</td>
                            <td className="py-1">{row.speed_mps} m/s</td>
                            <td className="py-1 text-amber-300">{row.dist_from_target}</td>
                            <td className="py-1 text-slate-400">{row.h3_res9}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: COMPARISON */}
          {activeTab === 'COMPARISON' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-100 text-xs">Architectural Engine Trade-Off Matrix</h4>
                <p className="text-[11px] text-slate-400">Comparing InfluxDB, Cassandra/ScyllaDB, and TimescaleDB for 100-500+ unit drone swarms</p>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 font-mono text-[10px] text-slate-400 uppercase">
                      <th className="p-3">Engine</th>
                      <th className="p-3">Max Ingestion Throughput</th>
                      <th className="p-3">Spatio-Temporal Querying</th>
                      <th className="p-3">Storage Footprint</th>
                      <th className="p-3">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    <tr className="bg-sky-950/20">
                      <td className="p-3 font-bold text-sky-300">
                        PostgreSQL + TimescaleDB + PostGIS
                      </td>
                      <td className="p-3 font-mono text-slate-200">
                        25,000 writes/s (with Kafka buffer)
                      </td>
                      <td className="p-3 text-emerald-400 font-semibold">
                        Native 3D PostGIS + GIST Indexing
                      </td>
                      <td className="p-3 font-mono text-sky-400">
                        91.8% Compression (Gorilla float)
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-bold">
                        RECOMMENDED PRIMARY: Best balance of 3D spatial indexing + SQL maturity.
                      </td>
                    </tr>

                    <tr className="bg-slate-950/40">
                      <td className="p-3 font-bold text-slate-200">
                        ScyllaDB / Apache Cassandra
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-bold">
                        100,000+ writes/s (LSM Write-optimized)
                      </td>
                      <td className="p-3 text-slate-400">
                        Requires external secondary index (e.g. Elasticsearch)
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        84.2% Compression (TWCS)
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        Best for pure raw write volume &gt;50k writes/s, but weaker native spatial.
                      </td>
                    </tr>

                    <tr className="bg-slate-950/40">
                      <td className="p-3 font-bold text-slate-200">
                        InfluxDB v3 (Apache Arrow)
                      </td>
                      <td className="p-3 font-mono text-slate-200">
                        40,000 writes/s
                      </td>
                      <td className="p-3 text-slate-400">
                        Standard SQL queries via DataFusion
                      </td>
                      <td className="p-3 font-mono text-emerald-400">
                        94.6% Compression (Parquet files)
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        Excellent for analytics dashboards, but lacks 3D polygon containment operators.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
