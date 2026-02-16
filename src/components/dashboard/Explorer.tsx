import { ChevronLeft, Folder, ChevronRight, FileText, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { copyToClipboard } from '../../utils';

interface ExplorerProps {
  currentNavPath: string | null;
  goBack: () => void;
  breakdownData: any[];
  setCurrentNavPath: (path: string) => void;
  formatBytes: (bytes: number) => string;
  CustomTooltip: any;
  COLORS: string[];
  showToast: (msg: string) => void;
}

export function Explorer({ 
  currentNavPath, 
  goBack, 
  breakdownData, 
  setCurrentNavPath, 
  formatBytes, 
  CustomTooltip,
  COLORS,
  showToast
}: ExplorerProps) {
  
  const handleItemClick = (item: any) => {
    const path = item.type === 'dir' ? item.path : currentNavPath;
    if (path) {
      copyToClipboard(path);
      showToast(`Caminho copiado: ${path.split('\\').pop()}`);
      if (item.type === 'dir') {
        setCurrentNavPath(item.path);
      }
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3 overflow-hidden">
          <button 
            onClick={goBack} 
            className="p-2 transition-all rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
          <div 
            className="flex items-center gap-2 px-4 py-2 overflow-hidden border bg-slate-900 rounded-xl border-slate-800 cursor-pointer hover:border-blue-500/50 group"
            onClick={() => currentNavPath && copyToClipboard(currentNavPath) && showToast("Caminho atual copiado!")}
          >
            <Folder size={16} className="shrink-0 text-blue-400" />
            <span className="text-xs font-mono font-medium truncate text-blue-400 max-w-[200px] sm:max-w-md">
              {currentNavPath}
            </span>
            <Copy size={12} className="opacity-0 group-hover:opacity-100 text-slate-500 transition-opacity" />
          </div>
        </div>
        <h3 className="hidden text-sm font-semibold tracking-wide uppercase sm:block text-slate-500">Explorador Hierárquico</h3>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="p-6 border lg:col-span-2 bg-slate-800/40 rounded-2xl border-slate-700/50 h-[450px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={breakdownData} 
              layout="vertical" 
              margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
              onClick={(data: any) => {
                if (data && data.activePayload) {
                  handleItemClick(data.activePayload[0].payload);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.5} />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={140} 
                tick={{fontSize: 11, fill: '#94a3b8'}}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                content={<CustomTooltip formatBytes={formatBytes} />}
                cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={800}>
                {breakdownData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.type === 'files' ? '#64748b' : COLORS[index % COLORS.length]} 
                    className="cursor-pointer hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col border bg-slate-900/50 rounded-2xl border-slate-800 overflow-hidden h-[450px]">
          <div className="px-5 py-4 border-b border-slate-800 bg-slate-800/20">
            <h4 className="text-sm font-bold text-slate-400">Conteúdo da Pasta</h4>
          </div>
          <div className="flex-1 overflow-y-auto">
            {breakdownData.map((item, i) => (
              <div 
                key={i} 
                className="flex items-center gap-4 px-5 py-3 transition-colors border-b border-slate-800/50 last:border-0 cursor-pointer hover:bg-slate-800/50 group"
                onClick={() => handleItemClick(item)}
              >
                {item.type === 'dir' ? <Folder size={16} className="text-blue-500" /> : <FileText size={16} className="text-slate-500" />}
                <span className="flex-1 text-sm font-medium truncate text-slate-300">{item.name}</span>
                <span className="text-xs font-mono font-semibold text-slate-500">{formatBytes(item.value)}</span>
                <Copy size={12} className="opacity-0 group-hover:opacity-100 text-slate-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
