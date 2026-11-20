import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Search, 
  Check, 
  X, 
  Upload, 
  Loader2, 
  Sparkles, 
  ExternalLink, 
  Trash2 
} from 'lucide-react';
import { searchProductImages } from '../services/imageSearchService';

export interface WebImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  initialImages?: string[];
  currentImageUrl?: string;
  onSelectImage: (imageUrl: string) => void;
}

export const WebImagePickerModal: React.FC<WebImagePickerModalProps> = ({
  isOpen,
  onClose,
  productName,
  initialImages,
  currentImageUrl = '',
  onSelectImage
}) => {
  const [searchTerm, setSearchTerm] = useState(productName || '');
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>(currentImageUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const activeSearchIdRef = useRef(0);

  const executeSearch = async (termToSearch: string) => {
    const term = termToSearch.trim();
    if (!term || term.length < 2) return;

    const currentSearchId = ++activeSearchIdRef.current;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const results = await searchProductImages(term, 12);
      if (currentSearchId !== activeSearchIdRef.current) return;

      if (results && results.length > 0) {
        setImages(results);
        setSelectedImage(prev => (prev && results.includes(prev) ? prev : results[0]));
      } else {
        setImages([]);
        setErrorMsg('Nenhuma imagem encontrada para este termo. Tente refinar a busca com a marca ou modelo.');
      }
    } catch (err) {
      if (currentSearchId !== activeSearchIdRef.current) return;
      console.error('Erro ao buscar imagens na web:', err);
      setErrorMsg('Falha ao consultar imagens na web. Verifique sua conexão.');
    } finally {
      if (currentSearchId === activeSearchIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSearchTerm(productName || '');
      setSelectedImage(currentImageUrl || (initialImages && initialImages[0]) || '');
      setErrorMsg(null);

      if (initialImages && initialImages.length > 0) {
        setImages(initialImages);
        setIsLoading(false);
      } else if (productName && productName.trim().length >= 2) {
        executeSearch(productName.trim());
      } else {
        setImages([]);
        setIsLoading(false);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Suporte a colar print (Ctrl+V) direto no modal
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              if (dataUrl) {
                setImages(prev => [dataUrl, ...prev.filter(img => img !== dataUrl)]);
                setSelectedImage(dataUrl);
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchTerm);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setImages(prev => [dataUrl, ...prev.filter(img => img !== dataUrl)]);
        setSelectedImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    onSelectImage(selectedImage);
    onClose();
  };

  const handleRemovePhoto = () => {
    onSelectImage('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div 
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Pesquisar e Escolher Foto do Produto</span>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold uppercase rounded-md tracking-wider">
                  Web & Arquivos
                </span>
              </h3>
              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                Escolha a foto que será impressa e enviada na proposta comercial para seu cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-slate-200 flex items-center justify-center transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Pesquisa e Upload */}
        <div className="shrink-0 p-4 sm:p-5 bg-white border-b border-slate-100">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 transition outline-none"
                title="Termo de pesquisa da foto do produto"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
              <button
                type="submit"
                disabled={isLoading || !searchTerm.trim()}
                className="h-10 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-initial"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Buscar na Web</span>
                  </>
                )}
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="Subir arquivo de foto do seu computador"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between text-xs text-slate-500 mt-2 px-1">
            <span>💡 Dica: Você também pode apertar <strong>Ctrl+V</strong> a qualquer momento para colar um print da área de transferência.</span>
            {images.length > 0 && (
              <span className="font-semibold text-slate-700">{images.length} imagem(ns) encontrada(s)</span>
            )}
          </div>
        </div>

        {/* Grid de Imagens */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-sky-600 animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-700">Pesquisando fotos de alta resolução na web...</p>
              <p className="text-xs text-slate-400 mt-1">Varrendo catálogos, distribuidores e e-commerces oficiais</p>
            </div>
          ) : errorMsg && images.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">{errorMsg}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Tente simplificar o nome do produto ou buscar pelo modelo exato no campo de pesquisa acima.
              </p>
            </div>
          ) : images.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">Nenhuma foto pesquisada ainda</p>
              <p className="text-xs text-slate-400 mt-1">
                Digite o nome ou modelo acima e clique em "Buscar na Web" ou cole uma imagem com Ctrl+V.
              </p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {images.map((imgUrl, idx) => {
                  const isCurrent = selectedImage === imgUrl;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedImage(imgUrl)}
                      onDoubleClick={() => {
                        setSelectedImage(imgUrl);
                        onSelectImage(imgUrl);
                        onClose();
                      }}
                      title="Clique para selecionar (duplo clique para aplicar imediatamente)"
                      className={`group relative rounded-2xl border-2 p-2 bg-white flex flex-col items-center justify-between cursor-pointer transition-all duration-150 shadow-2xs hover:shadow-md ${
                        isCurrent
                          ? 'border-emerald-500 ring-4 ring-emerald-100 bg-emerald-50/10 scale-[1.02]'
                          : 'border-slate-200 hover:border-sky-400 hover:bg-sky-50/20'
                      }`}
                    >
                      {/* Badge selecionado */}
                      {isCurrent && (
                        <div className="absolute top-2 left-2 z-10 bg-emerald-600 text-white rounded-full p-1 shadow-md flex items-center gap-1 text-[10px] font-bold px-2 py-0.5">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Selecionada</span>
                        </div>
                      )}

                      {/* Botão de abrir em aba nova */}
                      <a
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-lg bg-white/90 hover:bg-white text-slate-500 hover:text-sky-600 shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title="Ver imagem em tamanho original"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      {/* Imagem */}
                      <div className="w-full aspect-square flex items-center justify-center p-2 overflow-hidden rounded-xl bg-slate-50/50">
                        <img
                          src={imgUrl}
                          alt={`Opção de foto ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full object-contain group-hover:scale-105 transition duration-200"
                          loading="eager"
                        />
                      </div>

                      {/* Rótulo inferior */}
                      <div className="w-full text-center mt-2 pt-1 border-t border-slate-100">
                        <span className={`text-xs font-bold ${isCurrent ? 'text-emerald-700' : 'text-slate-500 group-hover:text-sky-600'}`}>
                          {isCurrent ? '✓ Foto Escolhida' : `Opção #${idx + 1}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 relative z-10 shadow-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {currentImageUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer w-full sm:w-auto justify-center"
                title="Deixar item sem foto no orçamento"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover Foto do Item</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedImage}
              onClick={handleConfirm}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Usar Esta Foto no Orçamento</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
