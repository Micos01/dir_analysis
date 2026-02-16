import { Search, FileText, Folder, Trash2, Copy } from 'lucide-react';
import { FileInfo } from '../../types';
import { copyToClipboard } from '../../utils';

interface FileListProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: FileInfo[];
  currentFiles: FileInfo[];
  addToDiscard: (file: FileInfo) => void;
  showToast: (msg: string) => void;
}

export function FileList({ searchTerm, setSearchTerm, searchResults, currentFiles, addToDiscard, showToast }: FileListProps) {
  const files = searchTerm.length > 2 ? searchResults : currentFiles;

  const handleCopyPath = (path: string) => {
    copyToClipboard(path);
    showToast(`Pasta copiada: ${path.split('\\').pop()}`);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 px-2">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-500">Listagem de Arquivos</h3>
        <div className="relative w-full max-w-lg group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Pesquisar em bilhões de arquivos..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="overflow-hidden border bg-slate-800/40 rounded-2xl border-slate-700/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-slate-500 border-b border-slate-700/50">Arquivo</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-slate-500 border-b border-slate-700/50">Tamanho</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-slate-500 border-b border-slate-700/50">Pasta Pai</th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-widest uppercase text-slate-500 border-b border-slate-700/50 text-center w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30 text-slate-300">
              {files.map((file, i) => (
                <tr key={i} className="hover:bg-slate-700/20 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-slate-500 shrink-0" />
                      <span className="text-sm font-medium truncate max-w-md" title={file.name}>{file.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs font-bold text-slate-400">{file.size_str}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div 
                      className="flex items-center gap-2 text-slate-500 hover:text-blue-400 cursor-pointer transition-colors"
                      onClick={() => handleCopyPath(file.parent_path)}
                      title="Clique para copiar o caminho da pasta"
                    >
                      <Folder size={14} className="shrink-0" />
                      <span className="text-xs truncate max-w-[150px] sm:max-w-xs">{file.parent_path.split('\\').pop()}</span>
                      <Copy size={10} className="opacity-0 group-hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button 
                      className="p-2 transition-all rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 active:scale-90"
                      onClick={() => addToDiscard(file)}
                      title="Mover para plano de limpeza"
                    >
                      <Trash2 size={16} />
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
