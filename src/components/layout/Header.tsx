import { HardDrive, FolderSearch } from 'lucide-react';

interface HeaderProps {
  filePath: string;
  setFilePath: (path: string) => void;
  selectFile: () => void;
  analyze: () => void;
  loading: boolean;
}

export function Header({ filePath, setFilePath, selectFile, analyze, loading }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-6 p-6 mb-8 border bg-slate-800/50 rounded-2xl border-slate-700 shadow-xl backdrop-blur-sm">
      <h1 className="flex items-center gap-3 text-xl font-bold text-white whitespace-nowrap">
        <HardDrive className="text-blue-500" size={28} /> 
        Análise de Diretórios
      </h1>
      
      <div className="flex flex-1 gap-3 min-w-[300px] max-w-3xl">
        <div className="relative flex items-center flex-1">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            className="w-full px-4 py-2.5 pr-12 text-sm transition-all border rounded-xl bg-slate-900 border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            placeholder="Caminho para o relatório.txt"
          />
          <button 
            className="absolute p-1.5 transition-all rounded-lg right-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-600"
            onClick={selectFile} 
            title="Selecionar Arquivo"
          >
            <FolderSearch size={18} />
          </button>
        </div>
        
        <button 
          className="px-6 py-2.5 font-semibold text-white transition-all bg-blue-600 rounded-xl hover:bg-blue-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          onClick={analyze} 
          disabled={loading}
        >
          {loading ? "Analisando..." : "Analisar"}
        </button>
      </div>
    </header>
  );
}
