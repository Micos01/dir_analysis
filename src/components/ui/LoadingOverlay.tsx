import { Loader2, Clock, Zap } from 'lucide-react';
import { ProgressEvent } from '../../types';

interface LoadingOverlayProps {
  progress: ProgressEvent;
  elapsedTime: number;
  formatTime: (seconds: number) => string;
}

export function LoadingOverlay({ progress, elapsedTime, formatTime }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
      <div className="p-12 text-center bg-slate-900 border border-blue-500/20 rounded-[32px] shadow-2xl shadow-blue-500/10 max-w-md w-full flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
          <Loader2 size={64} className="relative text-blue-500 animate-spin" />
        </div>
        
        <div>
          <h2 className="text-2xl font-black text-white">Processando</h2>
          <p className="mt-2 text-sm font-medium text-slate-400">{progress.status}</p>
        </div>
        
        <div className="flex w-full gap-4 mt-2">
          <div className="flex-1 p-4 border bg-slate-950 rounded-2xl border-slate-800">
            <div className="flex items-center justify-center gap-2 mb-1 text-slate-500">
              <Clock size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Tempo</span>
            </div>
            <span className="font-mono text-lg font-bold text-blue-400">{formatTime(elapsedTime)}</span>
          </div>
          
          {progress.count > 0 && (
            <div className="flex-1 p-4 border bg-slate-950 rounded-2xl border-slate-800">
              <div className="flex items-center justify-center gap-2 mb-1 text-slate-500">
                <Zap size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Registros</span>
              </div>
              <span className="font-mono text-lg font-bold text-emerald-400">
                {(progress.count / 1000000).toFixed(1)}M
              </span>
            </div>
          )}
        </div>
        
        <div className="text-[10px] text-slate-600 font-medium px-8 leading-relaxed">
          Otimizado com Memory Mapping e SIMD para performance máxima em arquivos de larga escala.
        </div>
      </div>
    </div>
  );
}
