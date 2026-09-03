import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  Plus, 
  Check,
  ExternalLink,
  Image as ImageIcon,
  Barcode,
  Receipt,
  Eye,
  BookmarkPlus,
  RefreshCw,
  ShoppingBag,
  Upload,
  X,
  Clipboard
} from 'lucide-react';
import { Product, QuoteItem, WebSearchResult } from '../types';
import { resolveProductDetails, cleanAlphanumericCode, cleanNcmCode, ProductCandidateListing, isExactProductUrl, extractStoreNameFromUrl, resolveImageForDescription } from '../utils/aiEmailParser';

interface WebSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToQuote: (item: Partial<QuoteItem>) => void;
  onSaveToCatalog: (prod: Product) => void;
  initialQuery?: string;
  targetItemIndex?: number | null;
  onUpdateQuoteItem?: (index: number, updatedData: Partial<QuoteItem>) => void;
  existingItem?: Partial<QuoteItem> | null;
}

export const WebSearchModal: React.FC<WebSearchModalProps> = ({
  isOpen,
  onClose,
  onAddToQuote,
  onSaveToCatalog,
  initialQuery = '',
  targetItemIndex = null,
  onUpdateQuoteItem,
  existingItem = null
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [savedCatalogSuccess, setSavedCatalogSuccess] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');

  // Active Standardized Product Form State
  const [standardizedName, setStandardizedName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [ncm, setNcm] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInQuote, setShowImageInQuote] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState('Informática & Tecnologia');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('Un.');
  const [candidateListings, setCandidateListings] = useState<ProductCandidateListing[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // When modal opens or initialQuery changes, run the AI standardization
  useEffect(() => {
    if (isOpen) {
      const q = initialQuery || query || 'Monitor Dell 27 4K';
      setQuery(q);
      setShowImageInQuote(existingItem?.showImage ?? false);
      runProductStandardization(q);
      setAddedSuccess(false);
      setSavedCatalogSuccess(false);
    }
  }, [isOpen, initialQuery, existingItem]);

  /** Converte um File ou Blob de imagem para Data URL (base64) e seta imageUrl */
  const loadImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setImageUrl(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  /** Handler de paste global na zona de drop */
  const handleZonePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const blob = imgItem.getAsFile();
      if (blob) loadImageFile(blob);
    }
  };

  /** Drag and drop */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadImageFile(file);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const runProductStandardization = (searchTerm: string) => {
    setIsSearching(true);
    setTimeout(() => {
      const details = resolveProductDetails(searchTerm, undefined, existingItem?.partNumber);

      // Prioridade absoluta: Se o item já possuía um Part Number real encontrado, preservá-lo!
      const finalPartNumber = existingItem?.partNumber && existingItem.partNumber.trim().length >= 2
        ? cleanAlphanumericCode(existingItem.partNumber)
        : cleanAlphanumericCode(details.partNumber);

      // Preservar NCM caso existente e válido
      const finalNcm = existingItem?.ncm && existingItem.ncm.trim().length >= 4
        ? cleanNcmCode(existingItem.ncm)
        : cleanNcmCode(details.ncm);

      // Buscar imagem correta de acordo com a Descrição Padronizada do Produto (Comercial)
      const accurateImage = resolveImageForDescription(details.standardizedName) || details.imageUrl;
      const finalImage = existingItem?.imageUrl && !existingItem.imageUrl.includes('photo-1526738549149-8e07eca6c147')
        ? existingItem.imageUrl
        : accurateImage;

      const exactSourceUrl = (existingItem?.sourceUrl && isExactProductUrl(existingItem.sourceUrl))
        ? existingItem.sourceUrl
        : (isExactProductUrl(details.sourceUrl) ? details.sourceUrl : '');

      const exactSupplier = exactSourceUrl
        ? (existingItem?.supplier || details.supplier || extractStoreNameFromUrl(exactSourceUrl))
        : '';

      setStandardizedName(details.standardizedName);
      setPartNumber(finalPartNumber);
      setNcm(finalNcm);
      setImageUrl(finalImage);
      setShowImageInQuote(existingItem?.showImage ?? false);
      setEstimatedCost(existingItem?.costPrice || details.estimatedCost);
      setSupplier(exactSupplier);
      setSourceUrl(exactSourceUrl);
      setCategory(details.category);
      setCandidateListings(details.candidateListings || []);
      setIsSearching(false);
    }, 250);
  };

  const handleSelectCandidate = (candidate: ProductCandidateListing) => {
    setStandardizedName(candidate.name);
    setPartNumber(cleanAlphanumericCode(candidate.partNumber));
    setNcm(cleanNcmCode(candidate.ncm));
    setImageUrl(candidate.imageUrl);
    setEstimatedCost(candidate.cost);
    setSupplier(candidate.supplier);
    setSourceUrl(candidate.directUrl);
  };

  const handleImportDirectUrl = (urlToImport: string) => {
    if (!urlToImport.trim()) return;
    setSourceUrl(urlToImport);

    // Extract readable name from URL slug
    let extractedName = '';
    try {
      const parsed = new URL(urlToImport);
      const pathname = parsed.pathname;
      const slugMatch = pathname.match(/\/([a-zA-Z0-9\-_]{5,})/);
      if (slugMatch) {
        extractedName = slugMatch[1]
          .replace(/^MLB-?\d*-?/i, '')
          .replace(/[-_]/g, ' ')
          .trim();
      }
    } catch (e) {
      extractedName = urlToImport.replace(/https?:\/\//, '').split('/')[1] || '';
    }

    if (extractedName) {
      setQuery(extractedName);
      runProductStandardization(extractedName);
    }
  };

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    runProductStandardization(query);
  };

  const handleApplyToQuote = () => {
    const itemData: Partial<QuoteItem> = {
      name: standardizedName,
      description: '', // Keep clean for quote, technical query stored in sourceUrl
      partNumber: cleanAlphanumericCode(partNumber),
      ncm: cleanNcmCode(ncm),
      imageUrl,
      showImage: showImageInQuote,
      costPrice: estimatedCost,
      quantity,
      unit,
      sourceUrl: sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(standardizedName + ' ' + partNumber)}&tbm=shop`
    };

    if (targetItemIndex !== null && onUpdateQuoteItem) {
      onUpdateQuoteItem(targetItemIndex, itemData);
    } else {
      onAddToQuote(itemData);
    }

    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 800);
  };

  const handleSaveToCatalogAction = () => {
    onSaveToCatalog({
      id: `prod-${Date.now()}`,
      sku: cleanAlphanumericCode(partNumber) || `INF-${Date.now().toString().slice(-4)}`,
      partNumber: cleanAlphanumericCode(partNumber),
      ncm: cleanNcmCode(ncm),
      name: standardizedName,
      description: `Part Number: ${cleanAlphanumericCode(partNumber)} | NCM: ${cleanNcmCode(ncm)}`,
      category,
      costPrice: estimatedCost,
      unit,
      supplier,
      stock: 10,
      lastUpdated: new Date().toISOString().split('T')[0],
      sourceUrl,
      imageUrl
    });

    setSavedCatalogSuccess(true);
    setTimeout(() => {
      setSavedCatalogSuccess(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-100 border border-sky-200 rounded-xl text-sky-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Identificação & Padronização de Produto Web
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] rounded-full font-bold">
                  IA Infodesk
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Busca dados na web, padroniza a descrição comercial, extrai Part Number e NCM limpos e captura a foto.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Search Bar Input & Direct URL Importer */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-2.5">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar produto específico (ex: Caixa de setor de direção Kombi 1.4 Flex 2012, Monitor Dell 27 4K)..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
              <span>{isSearching ? 'Buscando...' : 'Buscar na Web'}</span>
            </button>
          </form>

          {/* Direct Link Importer Tool */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">🔗 Colar Link de Anúncio Específico:</span>
            <input
              type="text"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="Cole a URL do Mercado Livre / Amazon / Loja (https://produto.mercadolivre.com.br/...)"
              className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-sky-500 font-mono"
            />
            <button
              type="button"
              onClick={() => handleImportDirectUrl(pastedUrl)}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold transition whitespace-nowrap"
            >
              Importar Dados
            </button>
          </div>
        </div>

        {/* Modal Body: Standardized Product Details Card */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Specific Candidate Listings If Available */}
          {candidateListings.length > 0 && (
            <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Anúncios Reais Específicos Encontrados:</span>
                </span>
                <span className="text-[10px] text-sky-700 font-medium">Clique para selecionar a foto e o link exatos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {candidateListings.map((cand) => (
                  <div 
                    key={cand.id} 
                    className="bg-white border border-slate-200 hover:border-sky-500 rounded-xl p-3 flex flex-col justify-between shadow-2xs transition group"
                  >
                    <div className="flex gap-3 items-start mb-2">
                      <div className="w-14 h-14 bg-slate-50 border border-slate-200 rounded-lg p-1 shrink-0 flex items-center justify-center overflow-hidden">
                        <img 
                          src={cand.imageUrl} 
                          alt={cand.name} 
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-2" title={cand.name}>
                          {cand.name}
                        </h5>
                        <div className="flex flex-wrap items-center gap-1 mt-1 text-[9px] font-mono">
                          <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">
                            PN: {cand.partNumber}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-medium">Preço Mercado</span>
                        <span className="text-xs font-bold text-emerald-700 font-mono">
                          R$ {cand.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <a
                          href={cand.directUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-medium transition"
                          title="Abrir anúncio específico"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(cand)}
                          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold transition shadow-xs"
                        >
                          Selecionar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            
            {/* Top Row: Photo & Standardized Name */}
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              
              {/* Product Photo Thumbnail Preview */}
              <div className="w-full sm:w-36 flex flex-col items-center gap-2 shrink-0">
                <div className="w-32 h-32 bg-white border border-slate-200 rounded-2xl p-2 flex items-center justify-center overflow-hidden shadow-xs relative group">
                  {imageUrl ? (
                    <img 
                      src={imageUrl} 
                      alt={standardizedName} 
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80';
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-slate-300" />
                  )}
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                    HD
                  </span>
                </div>

                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showImageInQuote}
                    onChange={(e) => setShowImageInQuote(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Usar foto na proposta</span>
                </label>
              </div>

              {/* Standardized Title & Description */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-sky-600" />
                    <span>Descrição Padronizada do Produto (Comercial)</span>
                  </label>
                  <input
                    type="text"
                    value={standardizedName}
                    onChange={(e) => setStandardizedName(e.target.value)}
                    placeholder="Descrição oficial e limpa do produto"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500 shadow-xs"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Nome limpo e formal que será exibido no orçamento e faturamento.
                  </span>
                </div>

                {/* Foto: colar / upload / buscar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-600">Foto do Produto</label>
                    {!imageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const newImg = resolveImageForDescription(standardizedName);
                          if (newImg) setImageUrl(newImg);
                        }}
                        className="text-[10px] text-sky-600 hover:text-sky-800 font-semibold hover:underline flex items-center gap-1 transition"
                      >
                        <Sparkles className="w-3 h-3 text-sky-500" />
                        <span>Buscar foto por esta descrição</span>
                      </button>
                    )}
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-[10px] text-red-500 hover:text-red-700 font-semibold hover:underline flex items-center gap-1 transition"
                      >
                        <X className="w-3 h-3" />
                        <span>Remover foto</span>
                      </button>
                    )}
                  </div>

                  {imageUrl ? (
                    /* Preview quando já há imagem */
                    <div className="flex items-center gap-2 p-2 bg-white border border-green-200 rounded-xl">
                      <img src={imageUrl} alt="preview" className="w-12 h-12 object-contain rounded-lg border border-slate-100" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-green-700">Foto carregada</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {imageUrl.startsWith('data:') ? 'Imagem local (colada/enviada)' : imageUrl.substring(0, 50) + '...'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Zona de colar / arrastar / upload */
                    <div
                      ref={dropZoneRef}
                      onPaste={handleZonePaste}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      tabIndex={0}
                      className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl py-4 px-3 bg-white hover:border-sky-300 hover:bg-sky-50/40 focus:border-sky-400 focus:bg-sky-50/60 transition cursor-pointer outline-none"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-semibold text-slate-600">
                            Clique para escolher arquivo
                          </p>
                          <p className="text-[10px] text-slate-400">
                            ou arraste uma foto &bull; ou <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-mono">Ctrl+V</kbd> para colar um print
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Input de arquivo oculto */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) loadImageFile(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

            </div>

            {/* Middle Row: Part Number & NCM (Clean without dots and spaces) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Part Number / Código do Fabricante (Sem pontos/espaços)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={partNumber}
                    onChange={(e) => setPartNumber(cleanAlphanumericCode(e.target.value))}
                    placeholder="Ex: 94534000 ou 210BBYQ"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-indigo-900 focus:outline-none focus:border-indigo-500 uppercase tracking-wider shadow-xs"
                  />
                  <span className="absolute right-3 top-2 text-[10px] font-bold text-slate-400">P/N</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Código do fabricante formatado para busca e catálogo.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span>NCM Fiscal (8 dígitos sem pontos)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={8}
                    value={ncm}
                    onChange={(e) => setNcm(cleanNcmCode(e.target.value))}
                    placeholder="Ex: 39249000 ou 85285200"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-900 focus:outline-none focus:border-emerald-500 tracking-wider shadow-xs"
                  />
                  <span className="absolute right-3 top-2 text-[10px] font-bold text-slate-400">NCM</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Classificação fiscal para notas e impostos da Infodesk.</span>
              </div>

            </div>

            {/* Bottom Row: Cost Price, Quantity, Supplier & Web Source */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
              
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Custo Fornecedor (R$)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-xs font-bold text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Qtd.</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-center text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unidade</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-center text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fornecedor / Loja</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Ex: KaBuM!, Mercado Livre, Amazon..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600">Link Direto do Produto (Link Exato)</label>
                  {!sourceUrl && (
                    <span className="text-[10px] text-slate-400">Nenhum link exato cadastrado (use as buscas abaixo para achar)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSourceUrl(val);
                      if (val && !supplier) {
                        const store = extractStoreNameFromUrl(val);
                        if (store) setSupplier(store);
                      }
                    }}
                    placeholder="Cole aqui o link exato do produto (Mercado Livre, Kabum, Amazon...)"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-800 hover:text-emerald-950 font-bold bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg border border-emerald-300 shrink-0 transition"
                      title="Abrir página exata do produto cadastrada"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Abrir</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 cursor-not-allowed"
                      title="Sem link exato do produto cadastrado"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                      <span>Sem Link</span>
                    </button>
                  )}
                </div>
              </div>

            </div>

          </div>

          {/* Direct Marketplace Search Shortcuts */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1.5">
                <span>🛒 Consultar Anúncios Reais nos Marketplaces:</span>
              </span>
              <span className="text-[11px] text-amber-700">Clique para abrir a busca exata em tempo real</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://lista.mercadolivre.com.br/${encodeURIComponent((query || standardizedName).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-'))}#D[A:${encodeURIComponent(query || standardizedName)}]`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-xl text-xs font-bold transition shadow-xs"
              >
                <span>🟡 Buscar no Mercado Livre</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(query || standardizedName)}&tbm=shop`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <span>🔵 Google Shopping</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href={`https://www.amazon.com.br/s?k=${encodeURIComponent(query || standardizedName)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <span>🟠 Amazon Brasil</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Quick Presets for Demo / Testing */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produtos Rápidos / Frequentes:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: 'Kombi Setor de Direção 1.4 Flex', query: 'Caixa de setor de direção da Kombi 1.4 Flex 2012' },
                { name: 'Organizador Tramontina Plurale', query: 'Organizador de pia Tramontina Plurale' },
                { name: 'Monitor Dell 27 4K S2722QC', query: 'Monitor Dell 27 4K UHD S2722QC' },
                { name: 'Multifuncional Brother DCP-T720DW', query: 'Brother DCP-T720DW' },
                { name: 'Nobreak APC 1500VA Bivolt', query: 'Nobreak APC Back-UPS 1500VA' },
                { name: 'SSD Kingston KC3000 1TB', query: 'SSD Kingston KC3000 1TB' },
                { name: 'Notebook Dell Inspiron 15 i5', query: 'Notebook Dell Inspiron 15 i5' }
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setQuery(p.query);
                    runProductStandardization(p.query);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Action Buttons Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveToCatalogAction}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
            >
              {savedCatalogSuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <BookmarkPlus className="w-3.5 h-3.5 text-sky-600" />}
              <span>{savedCatalogSuccess ? 'Salvo no Catálogo!' : 'Salvar no Catálogo'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApplyToQuote}
              className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2"
            >
              {addedSuccess ? <Check className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-white" />}
              <span>
                {addedSuccess 
                  ? 'Aplicado com Sucesso!' 
                  : (targetItemIndex !== null ? 'Atualizar Item no Orçamento' : 'Adicionar ao Orçamento')}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
