import { UploadCloud } from 'lucide-react';

export function DragOverlay() {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-blue-600/10 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-6 p-16 border-4 border-blue-500 border-dashed rounded-[40px] animate-in zoom-in-90 duration-200">
        <div className="p-8 bg-blue-500 rounded-full shadow-2xl shadow-blue-500/50 text-white animate-bounce">
          <UploadCloud size={80} />
        </div>
        <div className="text-center">
          <h2 className="text-4xl font-black text-white">Solte para Analisar</h2>
          <p className="mt-2 text-xl font-medium text-blue-400">Apenas arquivos .txt suportados</p>
        </div>
      </div>
    </div>
  );
}
