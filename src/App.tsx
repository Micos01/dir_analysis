import { useState, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AlertCircle, CheckCircle2 } from 'lucide-react';

// Types & Utils
import { FileInfo, DirInfo, AnalysisSummary, ProgressEvent } from "./types";
import { formatBytes, formatTime } from "./utils";

// Components
import { Header } from "./components/layout/Header";
import { StatsCards } from "./components/dashboard/StatsCards";
import { Explorer } from "./components/dashboard/Explorer";
import { ChartsGrid } from "./components/dashboard/ChartsGrid";
import { FileList } from "./components/dashboard/FileList";
import { DiscardSection } from "./components/dashboard/DiscardSection";
import { LoadingOverlay } from "./components/ui/LoadingOverlay";
import { DragOverlay } from "./components/ui/DragOverlay";

const CustomTooltip = ({ active, payload, label, formatBytes }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-tooltip">
        <p className="mb-2 text-sm font-bold text-white">{label}</p>
        <div className="space-y-1">
          <p className="text-xs text-blue-400">
            <span className="text-slate-500">Tamanho:</span> {formatBytes(data.value || data.size_bytes)}
          </p>
          {data.type && (
            <p className="text-xs text-emerald-400">
              <span className="text-slate-500">Tipo:</span> {data.type === 'dir' ? 'Pasta' : 'Arquivos Diretos'}
            </p>
          )}
          {data.parent_path && (
            <p className="text-[10px] text-slate-400 leading-tight pt-1 border-t border-slate-700 mt-1">
              {data.parent_path}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

function App() {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
  
  const [filePath, setFilePath] = useState("Arraste o arquivo para a tela");
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [discardList, setDiscardList] = useState<FileInfo[]>([]);
  
  const [progress, setProgress] = useState<ProgressEvent>({ count: 0, status: "Iniciando..." });
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number | null>(null);

  const [currentNavPath, setCurrentNavPath] = useState<string | null>(null);
  const [currentDirs, setCurrentDirs] = useState<DirInfo[]>([]);
  const [currentFiles, setCurrentFiles] = useState<FileInfo[]>([]);
  const [topFiles, setTopFiles] = useState<FileInfo[]>([]);
  const [searchResults, setSearchResults] = useState<FileInfo[]>([]);

  // Toast State
  const [toast, setToast] = useState<{msg: string, visible: boolean}>({ msg: "", visible: false });

  const showToast = (msg: string) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const path = paths[0];
          if (path.endsWith(".txt")) {
            setFilePath(path);
            analyzeWithPath(path);
          } else {
            setError("Por favor, solte um arquivo .txt");
          }
        }
      });

      const unlistenEnter = await listen("tauri://drag-enter", () => setIsDragging(true));
      const unlistenLeave = await listen("tauri://drag-leave", () => setIsDragging(false));
      const unlistenProgress = await listen<ProgressEvent>("processing-progress", (event) => setProgress(event.payload));

      return () => {
        unlistenDrop();
        unlistenEnter();
        unlistenLeave();
        unlistenProgress();
      };
    };

    setupListeners();
  }, []);

  useEffect(() => {
    if (currentNavPath) loadDirectory(currentNavPath);
  }, [currentNavPath]);

  useEffect(() => {
    if (summary) invoke<FileInfo[]>("get_top_files", { limit: 20 }).then(setTopFiles).catch(console.error);
  }, [summary]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length > 2) {
        invoke<FileInfo[]>("search_files", { term: searchTerm, limit: 100 }).then(setSearchResults).catch(console.error);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const startTimer = () => {
    setElapsedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => setElapsedTime(prev => prev + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const loadDirectory = async (path: string) => {
    try {
      const [dirs, files]: [DirInfo[], FileInfo[]] = await invoke("get_dir_content", { path });
      setCurrentDirs(dirs);
      setCurrentFiles(files);
    } catch (err: any) {
      setError("Erro ao carregar diretório: " + err.toString());
    }
  };

  const analyzeWithPath = async (path: string) => {
    if (!path || path === "Arraste o arquivo para a tela") return;
    setLoading(true);
    setError("");
    setDiscardList([]);
    setProgress({ count: 0, status: "Abrindo arquivo..." });
    startTimer();
    
    try {
      const data: AnalysisSummary = await invoke("parse_report", { reportPath: path });
      setSummary(data);
      setCurrentNavPath(data.root_path);
    } catch (err: any) {
      setError("Erro ao analisar: " + err.toString());
    } finally {
      setLoading(false);
      stopTimer();
    }
  };

  const selectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Relatório de Texto', extensions: ['txt'] }]
      });
      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        analyzeWithPath(selected);
      }
    } catch (err: any) {
      setError("Erro ao abrir janela: " + err.toString());
    }
  };

  const exportDiscardList = async () => {
    if (discardList.length === 0) return;
    try {
      const savePath = await save({
        filters: [{ name: 'Arquivo de Texto', extensions: ['txt'] }],
        defaultPath: 'lista_exclusao.txt'
      });
      if (savePath) {
        const content = discardList.map(f => `${f.parent_path}\\${f.name}`);
        await invoke("save_discard_list", { path: savePath, content });
        alert("Lista exportada com sucesso!");
      }
    } catch (err: any) {
      setError("Erro ao exportar: " + err.toString());
    }
  };

  const addToDiscard = (file: FileInfo) => {
    const fileId = `${file.parent_path}\\${file.name}`;
    if (!discardList.some(f => `${f.parent_path}\\${f.name}` === fileId)) {
      setDiscardList([...discardList, file]);
    }
  };

  const removeFromDiscard = (index: number) => {
    const newList = [...discardList];
    newList.splice(index, 1);
    setDiscardList(newList);
  };

  const goBack = () => {
    if (!currentNavPath) return;
    const parts = currentNavPath.split("\\");
    if (parts.length > 1) {
      parts.pop();
      setCurrentNavPath(parts.join("\\"));
    }
  };

  const totalDiscardSize = useMemo(() => discardList.reduce((sum, file) => sum + file.size_bytes, 0), [discardList]);

  const breakdownData = useMemo(() => {
    const data: any[] = [];
    const directFilesSize = currentFiles.reduce((sum, f) => sum + f.size_bytes, 0);
    if (directFilesSize > 0) data.push({ name: "[Arquivos Diretos]", value: directFilesSize, type: 'files' });
    currentDirs.forEach(d => {
      data.push({ name: d.path.split('\\').pop() || d.path, value: d.size_bytes, path: d.path, type: 'dir' });
    });
    return data.sort((a, b) => b.value - a.value);
  }, [currentDirs, currentFiles]);

  return (
    <div className={`min-h-screen p-6 transition-opacity duration-300 ${isDragging ? 'opacity-40' : 'opacity-100'}`}>
      {isDragging && <DragOverlay />}
      
      {loading && (
        <LoadingOverlay 
          progress={progress} 
          elapsedTime={elapsedTime} 
          formatTime={formatTime} 
        />
      )}

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[5000] flex items-center gap-3 px-6 py-3 bg-slate-800 border border-emerald-500/50 text-emerald-400 rounded-full shadow-2xl shadow-emerald-900/20 animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 size={18} />
          <span className="text-sm font-bold">{toast.msg}</span>
        </div>
      )}

      <Header 
        filePath={filePath} 
        setFilePath={setFilePath} 
        selectFile={selectFile} 
        analyze={() => analyzeWithPath(filePath)} 
        loading={loading} 
      />

      {error && (
        <div className="flex items-center gap-3 p-4 mb-8 border border-red-500/50 bg-red-500/10 text-red-200 rounded-2xl animate-in slide-in-from-top-4">
          <AlertCircle size={20} className="shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {summary && (
        <main className="flex flex-col gap-10 max-w-[1400px] mx-auto animate-in fade-in duration-700">
          <StatsCards 
            summary={summary} 
            totalDiscardSize={totalDiscardSize} 
            formatBytes={formatBytes} 
          />

          <Explorer 
            currentNavPath={currentNavPath} 
            goBack={goBack} 
            breakdownData={breakdownData} 
            setCurrentNavPath={setCurrentNavPath} 
            formatBytes={formatBytes} 
            CustomTooltip={CustomTooltip} 
            COLORS={COLORS}
            showToast={showToast}
          />

          <ChartsGrid 
            topFiles={topFiles} 
            COLORS={COLORS} 
            CustomTooltip={CustomTooltip} 
            formatBytes={formatBytes} 
          />

          <FileList 
            searchTerm={searchTerm} 
            setSearchTerm={setSearchTerm} 
            searchResults={searchResults} 
            currentFiles={currentFiles} 
            addToDiscard={addToDiscard} 
            showToast={showToast}
          />

          <DiscardSection 
            discardList={discardList} 
            exportDiscardList={exportDiscardList} 
            removeFromDiscard={removeFromDiscard} 
          />
        </main>
      )}
    </div>
  );
}

export default App;
