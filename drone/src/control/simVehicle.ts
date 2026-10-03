import { MAV_CMD, MAV_RESULT, type FlightMode } from '../link/mavlink';
import { FORCE_DISARM, type Step } from './protocol';

/**
 * A simulated multirotor that answers the same MAVLink commands a real
 * ArduCopter does, with its rules: it only arms when its pre-arm checks pass,
 * only takes off in GUIDED once armed, refuses to disarm in the air unless
 * forced, lands and disarms itself on touchdown, and disarms on the ground if
 * nobody takes off within 10 s. Kinematics are simple and honest: 5 m/s
 * across, 2.5 m/s up, 1.5 m/s down (1 m/s in the last metres of a landing).
 * Positions in local metres from the fleet origin; z is height above home.
 */

export type VState = 'GROUND' | 'ARMED' | 'CLIMB' | 'HOLD' | 'MOVE' | 'RTL' | 'LAND' | 'FALLING' | 'DOWN';

export interface Answer { result: number; text?: string }

const H_SPEED = 5, UP = 2.5, DOWN = 1.5, RTL_ALT = 15, IDLE_DISARM_S = 10;

export class SimVehicle {
  x: number; y: number; z = 0; vx = 0; vy = 0; vz = 0;
  armed = false;
  mode: FlightMode = 'LOITER';
  state: VState = 'GROUND';
  target: { x: number; y: number; z: number } | null = null;
  private idle = 0;
  private rtlLeg: 'CLIMB' | 'HOME' | null = null;
  /** Pre-arm check: null when the aircraft may arm, else the autopilot's reason. */
  prearm: () => string | null = () => null;
  /** Things the aircraft says (STATUSTEXT), e.g. "Disarming: landed". */
  onText: ((text: string) => void) | null = null;

  constructor(readonly id: string, readonly home: { x: number; y: number }) { this.x = home.x; this.y = home.y; }

  get airborne() { return this.z > 0.3 || this.state === 'CLIMB'; }
  get speed() { return Math.hypot(this.vx, this.vy); }

  handle(s: Step): Answer {
    switch (s.cmd) {
      case MAV_CMD.COMPONENT_ARM_DISARM: {
        if (s.params[0] >= 1) {
          if (this.state === 'DOWN') return { result: MAV_RESULT.DENIED, text: 'PreArm: crashed, inspect the aircraft' };
          if (this.armed) return { result: MAV_RESULT.ACCEPTED };
          const why = this.prearm();
          if (why) return { result: MAV_RESULT.DENIED, text: why };
          this.armed = true; this.state = 'ARMED'; this.idle = 0; return { result: MAV_RESULT.ACCEPTED };
        }
        if (this.airborne && s.params[1] !== FORCE_DISARM) return { result: MAV_RESULT.DENIED, text: 'Disarm: vehicle is flying' };
        const wasFlying = this.airborne;
        this.armed = false; this.target = null;
        this.state = wasFlying ? 'FALLING' : 'GROUND';
        if (wasFlying) this.onText?.('Emergency stop: motors off in flight');
        return { result: MAV_RESULT.ACCEPTED };
      }
      case MAV_CMD.DO_SET_MODE: {
        const m = s.mode ?? 'OTHER';
        if (!['GUIDED', 'LOITER', 'RTL', 'LAND', 'POSITION', 'ALT_HOLD', 'STABILIZE'].includes(m)) return { result: MAV_RESULT.UNSUPPORTED };
        this.mode = m;
        if (m === 'LOITER' || m === 'POSITION') { if (this.airborne) { this.target = { x: this.x, y: this.y, z: this.z }; this.state = 'HOLD'; } }
        if (m === 'RTL') this.startRtl();
        if (m === 'LAND') this.startLand();
        return { result: MAV_RESULT.ACCEPTED };
      }
      case MAV_CMD.TAKEOFF: {
        if (!this.armed) return { result: MAV_RESULT.FAILED, text: 'Takeoff: not armed' };
        if (this.mode !== 'GUIDED') return { result: MAV_RESULT.FAILED, text: 'Takeoff: needs GUIDED mode' };
        if (this.airborne) return { result: MAV_RESULT.FAILED, text: 'Takeoff: already flying' };
        this.target = { x: this.x, y: this.y, z: Math.max(2, Math.min(120, s.to?.altM ?? 10)) }; this.state = 'CLIMB';
        return { result: MAV_RESULT.ACCEPTED };
      }
      case MAV_CMD.DO_REPOSITION: {
        if (!this.airborne || !this.armed) return { result: MAV_RESULT.DENIED, text: 'Go to: take off first' };
        const to = s.to!;
        this.mode = 'GUIDED'; this.rtlLeg = null;
        this.target = { x: Number.isNaN(to.x) ? this.x : to.x, y: Number.isNaN(to.y) ? this.y : to.y, z: Math.max(2, Math.min(120, to.altM)) }; this.state = 'MOVE';
        return { result: MAV_RESULT.ACCEPTED };
      }
      case MAV_CMD.RETURN_TO_LAUNCH: {
        if (!this.airborne) return { result: MAV_RESULT.ACCEPTED };
        this.mode = 'RTL'; this.startRtl(); return { result: MAV_RESULT.ACCEPTED };
      }
      case MAV_CMD.LAND: {
        if (!this.airborne) return { result: MAV_RESULT.ACCEPTED };
        this.mode = 'LAND'; this.startLand(); return { result: MAV_RESULT.ACCEPTED };
      }
    }
    return { result: MAV_RESULT.UNSUPPORTED };
  }

  private startRtl() { if (!this.airborne) return; this.rtlLeg = 'CLIMB'; this.state = 'RTL'; this.target = { x: this.x, y: this.y, z: Math.max(this.z, RTL_ALT) }; }
  private startLand() { if (!this.airborne) return; this.rtlLeg = null; this.state = 'LAND'; this.target = { x: this.x, y: this.y, z: 0 }; }

  step(dt: number) {
    if (this.state === 'FALLING') {
      this.vz = Math.max(-20, this.vz - 9.8 * dt); this.z += this.vz * dt; this.vx *= 0.98; this.vy *= 0.98;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.z <= 0) { this.z = 0; this.vx = this.vy = this.vz = 0; this.state = 'DOWN'; this.onText?.('Crash: hit the ground with motors off'); }
      return;
    }
    if (this.state === 'ARMED' || (this.armed && !this.airborne && this.state === 'GROUND')) {
      this.idle += dt;
      if (this.idle > IDLE_DISARM_S) { this.armed = false; this.state = 'GROUND'; this.onText?.('Disarming: no takeoff within 10 s'); }
      return;
    }
    if (!this.target) { this.vx = this.vy = this.vz = 0; return; }
    // RTL: climb, then home, then land.
    if (this.state === 'RTL' && this.rtlLeg === 'CLIMB' && Math.abs(this.z - this.target.z) < 0.2) { this.rtlLeg = 'HOME'; this.target = { x: this.home.x, y: this.home.y, z: this.target.z }; }
    if (this.state === 'RTL' && this.rtlLeg === 'HOME' && Math.hypot(this.x - this.home.x, this.y - this.home.y) < 0.3) { this.rtlLeg = null; this.state = 'LAND'; this.mode = 'LAND'; this.target = { x: this.home.x, y: this.home.y, z: 0 }; }
    const dx = this.target.x - this.x, dy = this.target.y - this.y, dz = this.target.z - this.z;
    const dh = Math.hypot(dx, dy);
    const h = Math.min(H_SPEED, dh / Math.max(dt, 1e-3), dh * 1.2 + 0.2);
    this.vx = dh > 1e-3 ? (dx / dh) * h : 0; this.vy = dh > 1e-3 ? (dy / dh) * h : 0;
    const down = this.state === 'LAND' && this.z < 3 ? 1 : DOWN;
    this.vz = Math.max(-down, Math.min(UP, dz * 1.5, dz / Math.max(dt, 1e-3)));
    this.x += this.vx * dt; this.y += this.vy * dt; this.z = Math.max(0, this.z + this.vz * dt);
    if (this.state === 'CLIMB' && Math.abs(dz) < 0.15) { this.state = 'HOLD'; this.mode = this.mode === 'GUIDED' ? 'GUIDED' : this.mode; }
    if (this.state === 'MOVE' && dh < 0.2 && Math.abs(dz) < 0.15) this.state = 'HOLD';
    if (this.state === 'LAND' && this.z <= 0.01) {
      this.z = 0; this.armed = false; this.state = 'GROUND'; this.target = null; this.vx = this.vy = this.vz = 0; this.mode = 'LAND';
      this.onText?.('Disarming: landed');
    }
  }
}
