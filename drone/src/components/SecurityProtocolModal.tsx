import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  Key, 
  Radio, 
  AlertTriangle, 
  CheckCircle, 
  Cpu, 
  FileCode, 
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { SecurityProtocolStatus } from '../types';

interface SecurityProtocolModalProps {
  onClose: () => void;
  securityStatus: SecurityProtocolStatus;
  onToggleEncryption: () => void;
  onSimulateMitm: () => void;
  onSimulateRogueDrone: () => void;
  onSimulateReplay: () => void;
}

export const SecurityProtocolModal: React.FC<SecurityProtocolModalProps> = ({
  onClose,
  securityStatus,
  onToggleEncryption,
  onSimulateMitm,
  onSimulateRogueDrone,
  onSimulateReplay,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MTLS_CHAIN' | 'ANTI_REPLAY' | 'ATTACK_TESTBED'>('OVERVIEW');
  const [copied, setCopied] = useState<boolean>(false);

  // Generate a mock 64-bit sliding window bitmap representation
  const slidingWindowBits = Array.from({ length: 64 }, (_, i) => {
    // Mostly 1s (received packets), with occasional dropped/out-of-order packets
    return (i % 7 !== 3);
  });

  const handleCopyCert = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="security-protocol-modal"
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              securityStatus.encryptionEnabled 
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-400' 
                : 'bg-rose-950/80 border-rose-700 text-rose-400'
            }`}>
              {securityStatus.encryptionEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-100">Zero-Trust Cryptographic Datalink Security</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  securityStatus.encryptionEnabled 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800' 
                    : 'bg-rose-950 text-rose-300 border-rose-800'
                }`}>
                  {securityStatus.encryptionEnabled ? 'DTLS 1.3 / mTLS ENFORCED' : 'UNENCRYPTED PLAINTEXT'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                End-to-end AEAD encryption (RFC 9147), hardware crypto identity (ATECC608B), &amp; anti-replay windowing
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
        <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-950/60 border-b border-slate-800">
          {[
            { id: 'OVERVIEW', label: 'Protocol Architecture' },
            { id: 'MTLS_CHAIN', label: 'mTLS & Hardware Identity' },
            { id: 'ANTI_REPLAY', label: 'Anti-Replay Sliding Window' },
            { id: 'ATTACK_TESTBED', label: 'Live Threat Testbed' },
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

          <div className="ml-auto">
            <button
              onClick={onToggleEncryption}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                securityStatus.encryptionEnabled
                  ? 'bg-rose-950/60 hover:bg-rose-900/80 border-rose-700 text-rose-200'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 border-emerald-700 text-emerald-200'
              }`}
            >
              {securityStatus.encryptionEnabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{securityStatus.encryptionEnabled ? 'Disable Encryption (Test)' : 'Enforce DTLS 1.3'}</span>
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Architecture Pipeline Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold font-mono">
                    <Cpu className="w-4 h-4" />
                    <span>EDGE DRONE CRYPTO</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 font-mono">
                    <li>&bull; Hardware HSM: Microchip ATECC608B</li>
                    <li>&bull; Private Key: ECC P-256 (Never exported)</li>
                    <li>&bull; Handshake: 1-RTT DTLS 1.3 Client</li>
                    <li>&bull; Cipher: TLS_AES_128_GCM_SHA256</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold font-mono">
                    <Radio className="w-4 h-4" />
                    <span>RF / MESH IN-TRANSIT</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 font-mono">
                    <li>&bull; Transport: UDP / Eclipse Zenoh / IP</li>
                    <li>&bull; Integrity: AEAD GCM Authentication Tag</li>
                    <li>&bull; Replay Defense: 64-Packet Bitmask Window</li>
                    <li>&bull; Overhead: ~16 bytes per datagram</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold font-mono">
                    <Lock className="w-4 h-4" />
                    <span>GROUND STATION GATEWAY</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-1 font-mono">
                    <li>&bull; Decryption: Kernel eBPF / DPDK wire-speed</li>
                    <li>&bull; Validation: Fleet Root CA Certificate Revocation (CRL)</li>
                    <li>&bull; GCS Streaming: TLS 1.3 Secure WebSocket</li>
                    <li>&bull; Authorization: Granular RBAC Tokens</li>
                  </ul>
                </div>
              </div>

              {/* Protocol Spec Deep-Dive */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-100 text-xs uppercase tracking-wider text-sky-400">
                  Why DTLS 1.3 (RFC 9147) Was Chosen Over Plain TLS (TCP) or WireGuard
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-slate-300 leading-relaxed">
                  <div>
                    <strong className="text-slate-100 block mb-1">1. Zero Head-of-Line Blocking</strong>
                    Standard TLS runs exclusively over TCP. In a flying drone fleet, momentary RF fade causes 2–5% packet loss. 
                    TCP blocks subsequent packets until retransmission completes, freezing flight control attitude loops for 200–500ms. 
                    DTLS 1.3 operates over connectionless UDP, allowing fresh telemetry to process immediately without waiting for lost frames.
                  </div>
                  <div>
                    <strong className="text-slate-100 block mb-1">2. Hardware-Rooted Mutual Authentication (mTLS)</strong>
                    Unlike consumer drones using static Wi-Fi passwords, each autonomous unit is flashed at manufacturing with an ECC private key stored inside a tamper-resistant cryptographic co-processor (Microchip ATECC608B). The ground station gateway cryptographically verifies the drone's X.509 certificate before accepting any telemetry or command link.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MTLS_CHAIN */}
          {activeTab === 'MTLS_CHAIN' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-xs">Cryptographic Certificate Trust Hierarchy</h4>
                  <p className="text-[11px] text-slate-400">Hierarchical X.509 PKI architecture with Hardware Security Module integration</p>
                </div>
                <button
                  onClick={() => handleCopyCert('MIIBvTCCAWWgAwIBAgIUQ7...[AeroSwarm Fleet Root CA]')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied CA' : 'Export Root CA'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {/* Level 1: Root CA */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400 shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">1. Fleet Root Certificate Authority (Offline HSM)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">VALID / AIR-GAPPED</span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      Subject: CN=AeroSwarm Master Root CA, O=AeroSwarm Autonomous Systems, C=US &bull; RSA-4096 / SHA-384
                    </div>
                  </div>
                </div>

                {/* Level 2: Intermediate CA */}
                <div className="ml-6 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">2. Regional Swarm Operational Intermediate CA</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">ONLINE / VAULT HSM</span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      Subject: CN=AeroSwarm Sector-Alpha Operational CA &bull; ECDSA P-384 / SHA-256 &bull; Automatic 90-day key rotation
                    </div>
                  </div>
                </div>

                {/* Level 3: Drone Hardware Leaf */}
                <div className="ml-12 p-3 rounded-xl bg-slate-950 border border-sky-900/60 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400 shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">3. Drone Client Hardware Identity (Per-Unit Leaf)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800">ATECC608B SILICON BINDING</span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      Subject: CN=DRN-001, Serial=0x01237A8E40B2, UID=ATECC608B-1001 &bull; ECDSA P-256
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1">
                      Private key generation occurs on-chip during silicon provisioning. Even with complete physical possession of the drone, the private key cannot be read or cloned via memory dumps.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ANTI_REPLAY */}
          {activeTab === 'ANTI_REPLAY' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-100 text-xs">DTLS 1.3 Anti-Replay Sliding Window Engine</h4>
                <p className="text-[11px] text-slate-400">Protects flight commands and waypoints against replay and injection attacks</p>
              </div>

              {/* Bitmask Grid */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-slate-400">Active 64-Packet Sequence Sliding Bitmask:</span>
                  <span className="text-emerald-400">Epoch: 0x0001 &bull; Max Sequence: #48,192</span>
                </div>

                <div className="grid grid-cols-16 gap-1 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                  {slidingWindowBits.map((received, idx) => (
                    <div
                      key={idx}
                      className={`h-4 rounded-sm flex items-center justify-center font-mono text-[9px] font-bold ${
                        received 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                          : 'bg-slate-800/40 text-slate-600 border border-slate-800'
                      }`}
                      title={`Bit ${idx}: ${received ? 'Verified Sequence' : 'Gap / Missing'}`}
                    >
                      {received ? '1' : '0'}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>&larr; Oldest Sequence in Window (-64)</span>
                  <span>Latest Authenticated Sequence (Head) &rarr;</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-1">
                <strong className="text-slate-200 block">How Replay Defense Works:</strong>
                An adversary listening on 2.4GHz RF could record a legitimate "DISARM_MOTORS" command sent during testing and replay it when a drone is airborne. 
                With DTLS 1.3 Anti-Replay, each datagram carries an encrypted monotonic sequence number. If a duplicate sequence is detected or falls behind the 64-packet window, the packet is instantly dropped without CPU overhead.
              </div>
            </div>
          )}

          {/* TAB 4: ATTACK_TESTBED */}
          {activeTab === 'ATTACK_TESTBED' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-100 text-xs">Live Security Threat Injection Testbed</h4>
                <p className="text-[11px] text-slate-400">Test ground station and drone cryptographic resilience against real-world RF attacks</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Attack 1: MITM */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">MITM Packet Tamper</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-rose-950 text-rose-300 border border-rose-800">
                        {securityStatus.mitmAttemptsBlocked} BLOCKED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Injects an in-flight byte modification on UDP payload to simulate RF bit tampering.
                    </p>
                  </div>
                  <button
                    onClick={onSimulateMitm}
                    className="w-full py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono text-[11px] font-semibold transition-colors"
                  >
                    Simulate Tamper Injection
                  </button>
                </div>

                {/* Attack 2: Rogue Drone */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">Rogue Drone Spoofing</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-rose-950 text-rose-300 border border-rose-800">
                        {securityStatus.rogueDronesRejected} REJECTED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Attempts to inject false drone telemetry from an untrusted unit lacking Fleet Root CA signature.
                    </p>
                  </div>
                  <button
                    onClick={onSimulateRogueDrone}
                    className="w-full py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono text-[11px] font-semibold transition-colors"
                  >
                    Attempt Rogue Connection
                  </button>
                </div>

                {/* Attack 3: Command Replay */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs">Command Replay Attack</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
                        {securityStatus.replayAttacksNeutralized} NEUTRALIZED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Re-broadcasts captured flight telemetry packet with a duplicate or outdated sequence number.
                    </p>
                  </div>
                  <button
                    onClick={onSimulateReplay}
                    className="w-full py-2 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-700 text-amber-200 font-mono text-[11px] font-semibold transition-colors"
                  >
                    Trigger Replay Attack
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
