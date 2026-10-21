import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#121214] flex items-center justify-center p-6 text-slate-100 select-none">
          <div className="w-full max-w-md bg-[#18181c] border border-[#2c2c35] rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(238,44,36,0.25)]">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold">
                Claro Rede Externa &bull; Sistema Operacional
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Instabilidade Temporária
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Ocorreu uma falha na renderização deste módulo. Suas informações operacionais continuam gravadas e seguras no servidor.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Recarregar Página
              </button>
              <button
                type="button"
                onClick={this.handleHome}
                className="h-11 px-5 rounded-xl bg-[#121214] hover:bg-[#222228] border border-[#2c2c35] text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" /> Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
