import { Trash2, Download, X } from 'lucide-react';
import { FileInfo } from '../../types';

interface DiscardSectionProps {
  discardList: FileInfo[];
  exportDiscardList: () => void;
  removeFromDiscard: (index: number) => void;
}

export function DiscardSection({ discardList, exportDiscardList, removeFromDiscard }: DiscardSectionProps) {
  if (discardList.length === 0) return null;

  return (
    <section className="pt-8 mt-12 border-t border-slate-800">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-red-400">
          <Trash2 size={24} /> 
          Plano de Limpeza ({discardList.length})
        </h3>
        <button 
          className="flex items-center gap-2 px-6 py-2.5 font-bold text-white transition-all bg-emerald-600 rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 active:scale-95"
          onClick={exportDiscardList}
        >
          <Download size={18} /> 
          Exportar Lista .txt
        </button>
      </div>

      <div className="overflow-hidden border border-red-500/20 bg-red-500/[0.02] rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-red-500/[0.05]">
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-red-400/70 border-b border-red-500/10">Arquivo</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-red-400/70 border-b border-red-500/10">Tamanho</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-red-400/70 border-b border-red-500/10">Localização</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-red-400/70 border-b border-red-500/10 text-center w-20">Remover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-500/5 text-slate-300">
              {discardList.map((file, i) => (
                <tr key={i} className="hover:bg-red-500/[0.03] transition-colors">
                  <td className="px-6 py-3">
                    <span className="text-sm font-medium">{file.name}</span>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-400">{file.size_str}</td>
                  <td className="px-6 py-3 text-[10px] font-mono text-slate-600 truncate max-w-sm">{file.parent_path}</td>
                  <td className="px-6 py-3 text-center">
                    <button 
                      className="p-1.5 transition-all rounded-lg text-slate-600 hover:text-white hover:bg-slate-700"
                      onClick={() => removeFromDiscard(i)}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
