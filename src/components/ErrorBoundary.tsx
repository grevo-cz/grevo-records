import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { BUILD_SHA } from '../lib/version';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to console so the user can capture it from DevTools if needed.
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || 'Něco se rozbilo.';
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-bg p-6">
        <div className="card p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-danger/15 text-danger inline-flex items-center justify-center mb-4">
            <AlertOctagon className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Aplikace narazila na chybu</h1>
          <p className="text-text-secondary text-sm mb-6 break-words">{msg}</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={this.handleReset} className="btn-secondary">
              Zkusit znovu
            </button>
            <button onClick={this.handleReload} className="btn-primary">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-6 font-mono">
            build {BUILD_SHA}
          </p>
        </div>
      </div>
    );
  }
}
