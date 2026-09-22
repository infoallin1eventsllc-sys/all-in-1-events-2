import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { recorder } from '../record/recorder';

/**
 * One dashboard failing must not take the others down mid-operation.
 *
 * A canvas, a WebGL context loss or a malformed frame from a real aircraft can
 * throw during render. Without this the whole app white-screens — during a show.
 * The boundary keeps the app bar alive, records the failure, and offers a retry.
 */

interface Props { name: string; children: React.ReactNode; onReset?: () => void }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Goes into the flight record: a crash during an operation is evidence.
    recorder.event('SYSTEM', 'CRITICAL', `${this.props.name} failed: ${error.message}`);
    console.error(`[${this.props.name}]`, error, info.componentStack);
  }

  private reset = () => { this.setState({ error: null }); this.props.onReset?.(); };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-[var(--radius-card)] border border-line bg-surface p-6 max-w-2xl">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-bad-soft text-bad flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">{this.props.name} stopped</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              This view hit an error and was isolated so the rest of the console keeps running. The failure is in the
              flight record. Any aircraft in the air is unaffected — it flies its own plan.
            </p>
            <pre className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-ink-2 overflow-x-auto num">{this.state.error.message}</pre>
            <button onClick={this.reset}
              className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-accent text-accent-ink text-[13px] font-medium hover:opacity-90">
              <RotateCcw className="w-4 h-4" />Reload this view
            </button>
          </div>
        </div>
      </div>
    );
  }
}
