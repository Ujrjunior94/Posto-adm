import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Camera,
  Sparkles,
  FlaskConical,
  FileText,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface ModalScannerLaudoChatGPTProps {
  isOpen: boolean;
  onClose: () => void;
  onProcessarImagem: (base64: string, mime: string) => Promise<void>;
  carregando: boolean;
  erro: string;
}

export const ModalScannerLaudoChatGPT: React.FC<ModalScannerLaudoChatGPTProps> = ({
  isOpen,
  onClose,
  onProcessarImagem,
  carregando,
  erro,
}) => {
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagemPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmeter = async () => {
    if (!imagemPreview) return;
    await onProcessarImagem(imagemPreview, mimeType);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Topo do Modal */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white">
              <Sparkles className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Escanear Laudo ou Proveta com ChatGPT</h3>
              <p className="text-xs text-slate-300">
                Reconhecimento visual automático via OpenAI GPT-4o Vision
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Upload e Preview */}
        <div className="p-6 space-y-4 text-xs">
          {erro && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {!imagemPreview ? (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100/60 transition space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  Envie a foto do laudo ou do ensaio na proveta
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Suporta Boletim de Conformidade (BOC), DANFE/NF-e, proveta de 100 mL ou termodensímetro
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Selecionar Arquivo
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Tirar Foto Agora
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-64 bg-slate-950 flex items-center justify-center">
                <img
                  src={imagemPreview}
                  alt="Pré-visualização do laudo"
                  className="max-h-64 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => setImagemPreview(null)}
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-white rounded-full hover:bg-red-600 transition"
                  title="Trocar imagem"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  O ChatGPT (GPT-4o Vision) analisará a imagem para preencher automaticamente temperatura, densidade, proveta e NF-e.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!imagemPreview || carregando}
            onClick={handleSubmeter}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            {carregando ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ChatGPT Lendo Imagem...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-300" />
                Extrair Dados com ChatGPT
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
