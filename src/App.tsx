import { useState, useMemo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
   Cell, 
} from 'recharts';
import { Folder, FileText, HardDrive, AlertCircle, Search, Trash2, UploadCloud, FolderSearch, X, Download, ChevronRight, ChevronLeft, Loader2, Clock, Zap } from 'lucide-react';
import "./App.css";

interface FileInfo {
  name: string;
  size_bytes: number;
  size_str: string;
  parent_path: string;
}

interface DirInfo {
  path: string;
  size_bytes: number;
  size_str: string;
}

interface AnalysisSummary {
  total_size_bytes: number;
  total_dirs: number;
  total_files: number;
  root_path: string;
}

interface ProgressEvent {
  count: number;
  status: string;
}

const CustomTooltip = ({ active, payload, label, formatBytes }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-tooltip">
        <p className="label">{`${label}`}</p>
        <p className="size">{`Tamanho: ${formatBytes(data.value || data.size_bytes)}`}</p>
        {data.type && <p className="type">{`Tipo: ${data.type === 'dir' ? 'Pasta' : 'Arquivos Diretos'}`}</p>}
        {data.parent_path && <p className="path">{`Local: ${data.parent_path}`}</p>}
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
  
  // Progress State
  const [progress, setProgress] = useState<ProgressEvent>({ count: 0, status: "Iniciando..." });
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Navigation State
  const [currentNavPath, setCurrentNavPath] = useState<string | null>(null);
  const [currentDirs, setCurrentDirs] = useState<DirInfo[]>([]);
  const [currentFiles, setCurrentFiles] = useState<FileInfo[]>([]);
  const [topFiles, setTopFiles] = useState<FileInfo[]>([]);
  const [searchResults, setSearchResults] = useState<FileInfo[]>([]);

  useEffect(() => {
    const unlistenDrop = listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
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

    const unlistenEnter = listen("tauri://drag-enter", () => setIsDragging(true));
    const unlistenLeave = listen("tauri://drag-leave", () => setIsDragging(false));

    const unlistenProgress = listen<ProgressEvent>("processing-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlistenDrop.then(f => f());
      unlistenEnter.then(f => f());
      unlistenLeave.then(f => f());
      unlistenProgress.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (currentNavPath) {
      loadDirectory(currentNavPath);
    }
  }, [currentNavPath]);

  useEffect(() => {
    if (summary) {
      invoke<FileInfo[]>("get_top_files", { limit: 20 }).then(setTopFiles).catch(console.error);
    }
  }, [summary]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length > 2) {
        invoke<FileInfo[]>("search_files", { term: searchTerm, limit: 100 })
          .then(setSearchResults)
          .catch(console.error);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const startTimer = () => {
    setElapsedTime(0);
    timerRef.current = window.setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const analyze = () => analyzeWithPath(filePath);

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

  const totalDiscardSize = useMemo(() => {
    return discardList.reduce((sum, file) => sum + file.size_bytes, 0);
  }, [discardList]);

  const breakdownData = useMemo(() => {
    const data: any[] = [];
    const directFilesSize = currentFiles.reduce((sum, f) => sum + f.size_bytes, 0);
    if (directFilesSize > 0) {
      data.push({ name: "[Arquivos Diretos]", value: directFilesSize, type: 'files' });
    }
    currentDirs.forEach(d => {
      data.push({ name: d.path.split('\\').pop() || d.path, value: d.size_bytes, path: d.path, type: 'dir' });
    });
    return data.sort((a, b) => b.value - a.value);
  }, [currentDirs, currentFiles]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const goBack = () => {
    if (!currentNavPath) return;
    const parts = currentNavPath.split("\\");
    if (parts.length > 1) {
      parts.pop();
      setCurrentNavPath(parts.join("\\"));
    }
  };

  return (
    <div className={`app-container ${isDragging ? 'dragging' : ''}`}>
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-content">
            <UploadCloud size={64} />
            <h2>Solte o Relatório Aqui</h2>
            <p>Apenas arquivos .txt são suportados</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <Loader2 size={48} className="spinner" />
            <h2>Processando Relatório</h2>
            <p className="status-text">{progress.status}</p>
            
            <div className="loading-stats">
              <div className="stat-item">
                <Clock size={18} />
                <span>Tempo: {formatTime(elapsedTime)}</span>
              </div>
              {progress.count > 0 && (
                <div className="stat-item">
                  <Zap size={18} />
                  <span>Registros: {(progress.count / 1000000).toFixed(1)}M</span>
                </div>
              )}
            </div>
            
            <div className="progress-hint">
              Esta operação pode levar alguns minutos para arquivos de grande escala.
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <h1><HardDrive size={24} /> Análise de Diretórios</h1>
        <div className="input-group">
          <div className="input-wrapper">
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="Caminho para o relatório.txt"
            />
            <button className="browse-btn" onClick={selectFile} title="Selecionar Arquivo">
              <FolderSearch size={20} />
            </button>
          </div>
          <button className="analyze-btn" onClick={analyze} disabled={loading}>
            {loading ? "Analisando..." : "Analisar"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <main className="dashboard">
          <section className="stats-cards">
            <div className="card">
              <h3>Tamanho Total</h3>
              <p className="big-stat">{formatBytes(summary.total_size_bytes)}</p>
            </div>
            <div className="card">
              <h3>Itens Mapeados</h3>
              <p className="small-stat">{summary.total_dirs.toLocaleString()} pastas / {summary.total_files.toLocaleString()} arquivos</p>
            </div>
            <div className="card highlight">
              <h3>Espaço a Liberar</h3>
              <p className="big-stat warning">{formatBytes(totalDiscardSize)}</p>
            </div>
          </section>

          <section className="explorer-section">
            <div className="card explorer-card">
              <div className="explorer-header">
                <div className="path-nav">
                  <button onClick={goBack} className="back-btn"><ChevronLeft size={18} /></button>
                  <div className="current-path-display">
                    <Folder size={16} className="icon" />
                    <span>{currentNavPath}</span>
                  </div>
                </div>
                <h3>Explorador Hierárquico</h3>
              </div>
              
              <div className="explorer-content">
                <div className="explorer-chart">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart 
                      data={breakdownData} 
                      layout="vertical" 
                      margin={{ left: 20, right: 30, top: 10, bottom: 10 }}
                      onClick={(data: any) => {
                        if (data && data.activePayload && data.activePayload[0].payload.type === 'dir') {
                          setCurrentNavPath(data.activePayload[0].payload.path);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                      <XAxis type="number" tickFormatter={(v) => formatBytes(v)} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={120} 
                        tick={{fontSize: 11, fill: '#94a3b8'}}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip formatBytes={formatBytes} />} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {breakdownData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.type === 'files' ? '#64748b' : COLORS[index % COLORS.length]} 
                            cursor={entry.type === 'dir' ? 'pointer' : 'default'}
                            fillOpacity={0.8}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="explorer-list">
                  <h4>Conteúdo Local</h4>
                  <div className="mini-list">
                    {breakdownData.map((item, i) => (
                      <div key={i} className={`mini-item ${item.type}`} onClick={() => item.type === 'dir' && setCurrentNavPath(item.path)}>
                        {item.type === 'dir' ? <Folder size={14} className="folder-icon" /> : <FileText size={14} className="file-icon" />}
                        <span className="name">{item.name}</span>
                        <span className="size">{formatBytes(item.value)}</span>
                        {item.type === 'dir' && <ChevronRight size={14} className="arrow" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="charts-grid">
            <div className="card chart-card">
              <h3>Maiores Arquivos (Global)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topFiles.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100} 
                      tick={{fontSize: 10, fill: '#94a3b8'}}
                      tickFormatter={(name) => name.length > 15 ? name.substring(0, 12) + '...' : name}
                    />
                    <Tooltip content={<CustomTooltip formatBytes={formatBytes} />} />
                    <Bar dataKey="size_bytes" radius={[0, 4, 4, 0]}>
                      {topFiles.slice(0, 10).map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="file-list-section">
            <div className="list-header">
              <h3>Busca e Detalhes</h3>
              <div className="search-box">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="card list-card">
              <table>
                <thead>
                  <tr>
                    <th>Nome do Arquivo</th>
                    <th>Tamanho</th>
                    <th>Diretório</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchTerm.length > 2 ? searchResults : currentFiles).map((file, i) => (
                    <tr key={i}>
                      <td className="file-cell">
                        <FileText size={14} className="icon" /> 
                        <span className="truncate">{file.name}</span>
                      </td>
                      <td className="size-cell">{file.size_str}</td>
                      <td className="path-cell">
                        <Folder size={14} className="icon" /> 
                        <span className="truncate">{file.parent_path.split('\\').pop()}</span>
                      </td>
                      <td className="action-cell">
                        <button className="delete-btn" onClick={() => addToDiscard(file)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {discardList.length > 0 && (
            <section className="discard-section">
              <div className="list-header">
                <h3><Trash2 size={20} /> Plano de Limpeza ({discardList.length})</h3>
                <button className="confirm-btn" onClick={exportDiscardList}>
                  <Download size={18} /> Exportar Lista .txt
                </button>
              </div>
              <div className="card discard-card">
                <table>
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Tamanho</th>
                      <th>Localização</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discardList.map((file, i) => (
                      <tr key={i}>
                        <td className="file-cell">{file.name}</td>
                        <td className="size-cell">{file.size_str}</td>
                        <td className="dimmed">{file.parent_path}</td>
                        <td className="action-cell">
                          <button className="undo-btn" onClick={() => removeFromDiscard(i)}>
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
