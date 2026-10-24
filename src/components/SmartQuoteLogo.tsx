import React, { useState } from 'react';

export interface SmartQuoteIconProps {
  size?: number;
  className?: string;
  inverted?: boolean;
}

export interface SmartQuoteLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showSubtitle?: boolean;
  showBadge?: boolean;
  inverted?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  badgeText?: string;
}

/**
 * Ícone Oficial SmartQuote:
 * Combina os marcadores de viewfinder/scanner com a curva do 'S'.
 * Utiliza o asset raster transparente extraído com fallback vetorial SVG nativo.
 */
export const SmartQuoteIcon: React.FC<SmartQuoteIconProps> = ({ 
  size = 30, 
  className = '',
  inverted = false
}) => {
  const [imgError, setImgError] = useState(false);

  // Fallback vetorial SVG caso a imagem raster falhe
  if (imgError) {
    const bracketColor = inverted ? '#94a3b8' : '#707e94';
    const sColor = inverted ? '#ffffff' : '#0b1320';

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        aria-label="SmartQuote Logo"
      >
        {/* Top-Right Bracket */}
        <path
          d="M 23.5 5.5 H 28 C 29.8 5.5 31 6.8 31 8.5 V 13"
          stroke={bracketColor}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom-Left Bracket */}
        <path
          d="M 12.5 30.5 H 8 C 6.2 30.5 5 29.2 5 27.5 V 23"
          stroke={bracketColor}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Stylized Scanner S */}
        <path
          d="M 17 5.5 H 10 C 7 5.5 5 7.5 5 10.5 C 5 16 31 15.5 31 25.5 C 31 28.5 29 30.5 26 30.5 H 19"
          stroke={sColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <img
      src="/smartquote-icon.png"
      alt="SmartQuote"
      width={size}
      height={size}
      onError={() => setImgError(true)}
      className={`shrink-0 object-contain select-none transition-transform duration-150 ${
        inverted ? 'filter brightness-0 invert' : ''
      } ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`
      }}
    />
  );
};

/**
 * Componente de Logomarca Oficial SmartQuote
 * Tipografia: Plus Jakarta Sans (fonte padrão oficial do sistema)
 */
export const SmartQuoteLogo: React.FC<SmartQuoteLogoProps> = ({
  size = 'md',
  showText = true,
  showSubtitle = false,
  showBadge = false,
  inverted = false,
  className = '',
  iconClassName = '',
  textClassName = '',
  badgeText = 'IA'
}) => {
  const sizeMap = {
    xs: { icon: 20, text: 'text-xs', sub: 'text-[8px]', badge: 'text-[8px] px-1 py-0.2' },
    sm: { icon: 24, text: 'text-sm', sub: 'text-[9px]', badge: 'text-[9px] px-1.5 py-0.2' },
    md: { icon: 28, text: 'text-base', sub: 'text-[10px]', badge: 'text-[10px] px-1.5 py-0.5' },
    lg: { icon: 34, text: 'text-lg md:text-xl', sub: 'text-xs', badge: 'text-xs px-2 py-0.5' },
    xl: { icon: 44, text: 'text-2xl sm:text-3xl', sub: 'text-xs sm:text-sm', badge: 'text-xs px-2.5 py-0.5' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const textColor = inverted ? 'text-white' : 'text-slate-900';
  const subColor = inverted ? 'text-slate-300' : 'text-slate-500';

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Símbolo do Scanner / Viewfinder */}
      <SmartQuoteIcon 
        size={currentSize.icon} 
        className={iconClassName} 
        inverted={inverted} 
      />

      {/* Tipografia Oficial Plus Jakarta Sans */}
      {showText && (
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className={`font-extrabold tracking-tight font-sans ${currentSize.text} ${textColor} ${textClassName}`}
              style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              SmartQuote
            </span>

            {showBadge && (
              <span
                className={`font-bold uppercase font-mono rounded-md ${
                  inverted
                    ? 'bg-sky-400/20 text-sky-200 border border-sky-400/30'
                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                } ${currentSize.badge}`}
              >
                {badgeText}
              </span>
            )}
          </div>

          {showSubtitle && (
            <span
              className={`font-medium leading-none mt-1 whitespace-nowrap ${currentSize.sub} ${subColor}`}
              style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              Automação Comercial
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartQuoteLogo;
