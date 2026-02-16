import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileInfo } from '../../types';

interface ChartsGridProps {
  topFiles: FileInfo[];
  COLORS: string[];
  CustomTooltip: any;
  formatBytes: (bytes: number) => string;
}

export function ChartsGrid({ topFiles, COLORS, CustomTooltip, formatBytes }: ChartsGridProps) {
  return (
    <section className="grid grid-cols-1">
      <div className="p-6 border bg-slate-800/40 rounded-2xl border-slate-700/50">
        <h3 className="mb-6 text-sm font-semibold tracking-wide uppercase text-slate-500 text-center">Maiores Arquivos (Top 10 Global)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topFiles.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} opacity={0.3} />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={120} 
                tick={{fontSize: 10, fill: '#94a3b8'}}
                tickFormatter={(name) => name.length > 18 ? name.substring(0, 15) + '...' : name}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip formatBytes={formatBytes} />} />
              <Bar dataKey="size_bytes" name="Tamanho" radius={[0, 6, 6, 0]}>
                {topFiles.slice(0, 10).map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
