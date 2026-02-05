import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
   Cell, 
} from 'recharts';
import { Folder, FileText, HardDrive, AlertCircle, Search, Trash2, UploadCloud, FolderSearch, X, Download, ChevronRight, ChevronLeft } from 'lucide-react';
import "./App.css";

interface FileInfo {
  name: string;
  size_bytes: number;
  size_str: string;
}

interface DirInfo {
  path: string;
  size_bytes: number;
  size_str: string;
  files: FileInfo[];
}

interface AnalysisResult {
  directories: DirInfo[];
  total_size_bytes: number;
}

interface DiscardFileInfo extends FileInfo {
  parentPath: string;
}

function App() {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];
  
  const [filePath, setFilePath] = useState("Arraste o arquivo para a tela");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [discardList, setDiscardList] = useState<DiscardFileInfo[]>([]);
  
  // Navigation State
  const [currentNavPath, setCurrentNavPath] = useState<string | null>(null);

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

    return () => {
      unlistenDrop.then(f => f());
      unlistenEnter.then(f => f());
      unlistenLeave.then(f => f());
    };
  }, []);

  const analyzeWithPath = async (path: string) => {
    if (!path || path === "Arraste o arquivo para a tela") return;
    setLoading(true);
    setError("");
    setDiscardList([]);
    try {
      const data: AnalysisResult = await invoke("parse_report", { path });
      setResult(data);
      // Set initial nav path to the root directory in the report
      if (data.directories.length > 0) {
        const roots = data.directories.filter(d => 
          !data.directories.some(other => d.path !== other.path && d.path.startsWith(other.path + "\\"))
        );
        setCurrentNavPath(roots[0]?.path || null);
      }
    } catch (err: any) {
      setError("Erro ao analisar: " + err.toString());
    } finally {
      setLoading(false);
    }
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
        const content = discardList.map(f => `${f.parentPath}\\${f.name}`);
        await invoke("save_discard_list", { path: savePath, content });
        alert("Lista exportada com sucesso!");
      }
    } catch (err: any) {
      setError("Erro ao exportar: " + err.toString());
    }
  };

  const addToDiscard = (file: FileInfo, parentPath: string) => {
    const fileId = `${parentPath}\\${file.name}`;
    if (!discardList.some(f => `${f.parentPath}\\${f.name}` === fileId)) {
      setDiscardList([...discardList, { ...file, parentPath }]);
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

  // Sub-directory Breakdown logic
  const breakdownData = useMemo(() => {
    if (!result || !currentNavPath) return [];
    
    const currentDir = result.directories.find(d => d.path === currentNavPath);
    if (!currentDir) return [];

    const data: any[] = [];

    // Add direct files size
    const directFilesSize = currentDir.files.reduce((sum, f) => sum + f.size_bytes, 0);
    if (directFilesSize > 0) {
      data.push({
        name: "[Arquivos Diretos]",
        value: directFilesSize,
        type: 'files'
      });
    }

    // Find immediate sub-directories
    result.directories.forEach(d => {
      if (d.path.startsWith(currentNavPath + "\\")) {
        const relativePath = d.path.substring(currentNavPath.length + 1);
        if (!relativePath.includes("\\")) {
          data.push({
            name: relativePath,
            value: d.size_bytes,
            path: d.path,
            type: 'dir'
          });
        }
      }
    });

    return data.sort((a, b) => b.value - a.value);
  }, [result, currentNavPath]);

  const topFiles = useMemo(() => {
    if (!result) return [];
    const allFiles: any[] = [];
    result.directories.forEach(dir => {
      dir.files.forEach(file => {
        allFiles.push({ ...file, parentPath: dir.path });
      });
    });
    return allFiles.sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 20);
  }, [result]);

  const filteredFiles = useMemo(() => {
    if (!result) return [];
    const allFiles: any[] = [];
    result.directories.forEach(dir => {
      dir.files.forEach(file => {
        const fileId = `${dir.path}\\${file.name}`;
        const isDiscarded = discardList.some(f => `${f.parentPath}\\${f.name}` === fileId);
        if (!isDiscarded && (file.name.toLowerCase().includes(searchTerm.toLowerCase()) || dir.path.toLowerCase().includes(searchTerm.toLowerCase()))) {
          allFiles.push({ ...file, parentPath: dir.path });
        }
      });
    });
    return allFiles.sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 100);
  }, [result, searchTerm, discardList]);

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
      const parentPath = parts.join("\\");
      if (result?.directories.some(d => d.path === parentPath)) {
        setCurrentNavPath(parentPath);
      }
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

      {result && (
        <main className="dashboard">
          <section className="stats-cards">
            <div className="card">
              <h3>Tamanho Total</h3>
              <p className="big-stat">{formatBytes(result.total_size_bytes)}</p>
            </div>
            <div className="card">
              <h3>Pastas Mapeadas</h3>
              <p className="big-stat">{result.directories.length}</p>
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
                <h3>Explorador de Subdiretórios</h3>
              </div>
              
              <div className="explorer-content">
                <div className="explorer-chart">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={breakdownData} layout="vertical" onClick={(data: any) => {
                      if (data && data.activePayload && data.activePayload[0].payload.type === 'dir') {
                        setCurrentNavPath(data.activePayload[0].payload.path);
                      }
                    }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatBytes(v)} hide />
                      <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 11, fill: '#94a3b8'}} />
                      <Tooltip formatter={(value: number | undefined) => { if (value === undefined) return ""; return formatBytes(value) }} labelStyle={{color: '#1e293b'}} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {breakdownData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.type === 'files' ? '#64748b' : COLORS[index % COLORS.length]} 
                            cursor={entry.type === 'dir' ? 'pointer' : 'default'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="hint">Clique em uma barra de pasta para entrar nela</p>
                </div>
                
                <div className="explorer-list">
                  <h4>Conteúdo de {currentNavPath?.split('\\').pop()}</h4>
                  <div className="mini-list">
                    {breakdownData.map((item, i) => (
                      <div key={i} className={`mini-item ${item.type}`} onClick={() => item.type === 'dir' && setCurrentNavPath(item.path)}>
                        {item.type === 'dir' ? <Folder size={14} /> : <FileText size={14} />}
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
              <h3>Maiores Arquivos (Top 10)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topFiles.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => formatBytes(v)} hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 9}} />
                    <Tooltip formatter={(value: number | undefined) => { if (value === undefined) return "";  return formatBytes(value) }} />
                    <Bar dataKey="size_bytes" name="Tamanho" fill="#8884d8">
                      {topFiles.slice(0, 10).map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="file-list-section">
            <div className="list-header">
              <h3>Busca Geral de Arquivos</h3>
              <div className="search-box">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder="Filtrar arquivos ou caminhos..." 
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
                  {filteredFiles.map((file, i) => (
                    <tr key={i}>
                      <td title={file.name}><FileText size={14} className="icon" /> {file.name.length > 50 ? file.name.substring(0, 50) + '...' : file.name}</td>
                      <td>{file.size_str}</td>
                      <td title={file.parentPath}><Folder size={14} className="icon" /> {file.parentPath.split('\\').pop()}</td>
                      <td>
                        <button className="delete-btn" onClick={() => addToDiscard(file, file.parentPath)} title="Mover para lista de descarte">
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
                <h3><Trash2 size={20} /> Lista de Descarte ({discardList.length} itens)</h3>
                <button className="confirm-btn" onClick={exportDiscardList}>
                  <Download size={18} /> Exportar Lista de Exclusão
                </button>
              </div>
              <div className="card discard-card">
                <table>
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Tamanho</th>
                      <th>Localização</th>
                      <th>Remover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discardList.map((file, i) => (
                      <tr key={i}>
                        <td>{file.name}</td>
                        <td>{file.size_str}</td>
                        <td className="dimmed">{file.parentPath}</td>
                        <td>
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
