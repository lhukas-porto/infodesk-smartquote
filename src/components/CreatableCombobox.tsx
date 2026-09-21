import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { normalizeSearchText } from '../utils/aiEmailParser';

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onAddOption?: (newOption: string) => void;
  placeholder?: string;
  defaultValue?: string;
  textAlign?: 'left' | 'center' | 'right';
  className?: string;
  inputClassName?: string;
  autoUppercase?: boolean;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  value,
  onChange,
  options,
  onAddOption,
  placeholder,
  defaultValue,
  textAlign = 'left',
  className = '',
  inputClassName = '',
  autoUppercase = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [openUpwards, setOpenUpwards] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha dropdown ao clicar fora e salva nova opção se houver
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Detecta se deve abrir para cima ou para baixo para nunca ser cortado pelo rodapé
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 230 && rect.top > 230) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
    }
  }, [isOpen]);

  // Normalização de opções únicas sem vazios, SEMPRE em ordem alfabética
  const uniqueOptions = useMemo(() => {
    return Array.from(
      new Set(options.map(o => (o || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [options]);

  // Filtragem inteligente (insensível a acentos e maiúsculas)
  // Se filterText estiver vazio (ex: ao clicar na seta), exibe TODAS as opções cadastradas
  const filteredOptions = useMemo(() => {
    const term = normalizeSearchText(filterText);
    if (!term) return uniqueOptions;
    return uniqueOptions.filter(opt =>
      normalizeSearchText(opt).includes(term)
    );
  }, [uniqueOptions, filterText]);

  const isExactMatch = useMemo(() => {
    const term = normalizeSearchText(filterText);
    if (!term) return false;
    return uniqueOptions.some(
      opt => normalizeSearchText(opt) === term
    );
  }, [uniqueOptions, filterText]);

  const canAddNew = Boolean(
    filterText.trim() &&
    !isExactMatch
  );

  const handleSelectOption = (opt: string) => {
    const cleanOpt = opt.trim();
    onChange(cleanOpt);
    // Não chama onAddOption para opções já cadastradas (evita duplicatas)
    setFilterText('');
    setIsOpen(false);
  };

  const handleAddNew = () => {
    if (!filterText.trim()) return;
    const clean = filterText.trim();
    onChange(clean);
    if (onAddOption) onAddOption(clean);
    setFilterText('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = autoUppercase ? e.target.value.toUpperCase() : e.target.value;
    onChange(val);
    setFilterText(val);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputFocus = () => {
    setFilterText(''); // Abre mostrando todas as opções
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    const trimmed = (value || '').trim();
    if (!trimmed && defaultValue) {
      onChange(defaultValue);
      // Só registra o padrão se ele não for uma opção já existente
      const isExisting = uniqueOptions.some(o => o.toLowerCase() === defaultValue.toLowerCase());
      if (!isExisting && onAddOption) onAddOption(defaultValue);
    } else if (trimmed) {
      // Só chama onAddOption se for um valor NOVO (não existente na lista)
      const isExisting = uniqueOptions.some(o => o.toLowerCase() === trimmed.toLowerCase());
      if (!isExisting && onAddOption) onAddOption(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAddNew && filteredOptions.length === 0) {
        handleAddNew();
      } else if (filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  }[textAlign];

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value || ''}
          placeholder={placeholder || defaultValue || 'Selecione ou digite...'}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className={`w-full bg-slate-50 border border-slate-300 rounded-xl pr-8 pl-3 py-2 text-slate-900 text-xs focus:outline-none focus:border-sky-500 focus:bg-white transition ${alignClasses} ${inputClassName}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault(); // Evita perder o foco acidentalmente
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(prev => {
              const next = !prev;
              if (next) {
                setFilterText(''); // Garante que abre com todas as opções visíveis
                inputRef.current?.focus();
                inputRef.current?.select();
              }
              return next;
            });
          }}
          className="absolute right-2 p-1.5 text-slate-400 hover:text-slate-600 rounded-md transition cursor-pointer"
          title="Ver todas as opções cadastradas"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-sky-600' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 left-0 right-0 ${
            openUpwards ? 'bottom-full mb-1' : 'top-full mt-1'
          } bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100`}
        >
          {/* Opção de Adicionar Novo se digitou algo que não existe */}
          {canAddNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAddNew}
              className="w-full text-left px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-sky-200 mb-1"
            >
              <Plus className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Cadastrar nova: "<strong>{filterText.trim()}</strong>"</span>
            </button>
          )}

          {/* Lista de Opções Cadastradas */}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isSelected = opt.toLowerCase() === (value || '').toLowerCase().trim();
              return (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 text-sky-700 font-bold'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                </button>
              );
            })
          ) : (
            !canAddNew && (
              <div className="px-3 py-2 text-center text-[11px] text-slate-400">
                Nenhuma opção cadastrada
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
