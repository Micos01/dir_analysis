import { AnalysisSummary } from '../../types';

interface StatsCardsProps {
  summary: AnalysisSummary;
  totalDiscardSize: number;
  formatBytes: (bytes: number) => string;
}

export function StatsCards({ summary, totalDiscardSize, formatBytes }: StatsCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="p-6 border bg-slate-800/40 rounded-2xl border-slate-700/50">
        <h3 className="mb-2 text-xs font-bold tracking-widest uppercase text-slate-500">Tamanho Total</h3>
        <p className="text-3xl font-black text-white tabular-nums">{formatBytes(summary.total_size_bytes)}</p>
      </div>
      
      <div className="p-6 border bg-slate-800/40 rounded-2xl border-slate-700/50">
        <h3 className="mb-2 text-xs font-bold tracking-widest uppercase text-slate-500">Itens Mapeados</h3>
        <p className="text-xl font-bold text-slate-200">
          {summary.total_dirs.toLocaleString()} <span className="text-sm font-normal text-slate-500">pastas</span> / 
          {" "}{summary.total_files.toLocaleString()} <span className="text-sm font-normal text-slate-500">arquivos</span>
        </p>
      </div>
      
      <div className="p-6 border bg-amber-500/5 rounded-2xl border-amber-500/20">
        <h3 className="mb-2 text-xs font-bold tracking-widest uppercase text-amber-500/70">Espaço a Liberar</h3>
        <p className="text-3xl font-black text-amber-500 tabular-nums">{formatBytes(totalDiscardSize)}</p>
      </div>
    </section>
  );
}
