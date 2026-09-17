import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';

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

  // Normalização de opções únicas sem vazios
  const uniqueOptions = Array.from(
    new Set(options.map(o => (o || '').trim()).filter(Boolean))
  );

  // Filtragem
  const currentVal = value || defaultValue || '';
  const search = isOpen ? filterText.toLowerCase().trim() : '';
  const filteredOptions = uniqueOptions.filter(opt =>
    opt.toLowerCase().includes(search)
  );

  const isExactMatch = uniqueOptions.some(
    opt => opt.toLowerCase() === (isOpen ? filterText.toLowerCase().trim() : currentVal.toLowerCase().trim())
  );

  const canAddNew = Boolean(
    filterText.trim() &&
    !isExactMatch
  );

  const handleSelectOption = (opt: string) => {
    const cleanOpt = opt.trim();
    onChange(cleanOpt);
    if (onAddOption) onAddOption(cleanOpt);
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
    setFilterText(value || '');
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    const trimmed = (value || '').trim();
    if (!trimmed && defaultValue) {
      onChange(defaultValue);
      if (onAddOption) onAddOption(defaultValue);
    } else if (trimmed) {
      if (onAddOption) onAddOption(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAddNew) {
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
          onClick={() => {
            setIsOpen(prev => !prev);
            if (!isOpen) {
              setFilterText(value || '');
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 rounded-md transition"
          title="Ver opções cadastradas"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-sky-600' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
          {/* Opção de Adicionar Novo se digitou algo que não existe */}
          {canAddNew && (
            <button
              type="button"
              onClick={handleAddNew}
              className="w-full text-left px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-sky-200 mb-1"
            >
              <Plus className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">Adicionar "<strong>{filterText.trim()}</strong>"</span>
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
