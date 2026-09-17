# AGENTS.md — REGRAS DO PROJETO INFODESK SMARTQUOTE

## 🎨 DIRETRIZ VISUAL OBRIGATÓRIA (PADRÃO REFERÊNCIA DA FOTO)

Toda e qualquer interface criada no SmartQuote DEVE seguir estritamente o padrão da tela oficial de **Nova Proposta Comercial**:

1. **Títulos Principais (H1)**:
   - `text-lg md:text-xl font-bold text-slate-900 tracking-tight` (Classe: `.sq-page-title`).
   - Badge de código: `px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg` (`.sq-badge-code`).
   - Subtítulo: `text-xs text-slate-500 mt-0.5` (`.sq-page-subtitle`).

2. **Tópicos de Seções (H2/H3)**:
   - **SEMPRE EM NEGRITO MARCADO**: `text-sm md:text-base font-bold text-slate-900 flex items-center gap-2` (Classe: `.sq-section-title`).
   - Sempre acompanhados de ícone colorido de referência (`w-4 h-4 text-sky-600` ou semântico).

3. **Botões**:
   - Altura padrão uniforme: ~40px (`py-2.5 px-3.5` a `px-4`).
   - Cantos arredondados: `rounded-xl`.
   - Peso do texto: `font-bold text-xs sm:text-sm`.
   - Paleta oficial:
     - Neutro/Rascunho: `.sq-btn-neutral` (`bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200`)
     - Excel/Outlined: `.sq-btn-excel` (`bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80`)
     - Primário Azul: `.sq-btn-primary` (`bg-sky-600 hover:bg-sky-700 text-white shadow-xs`)
     - Primário Verde: `.sq-btn-emerald` (`bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white shadow-xs`)

4. **Cards de Métricas (Dashboard Superior)**:
   - `bg-white border border-slate-200 p-4 rounded-2xl shadow-xs`.
   - Rótulo superior: `text-[11px] font-semibold uppercase tracking-wider text-slate-500`.
   - Valor numérico: `text-base font-bold text-slate-900 font-mono`.
   - Legenda inferior: `text-[10px] text-slate-400 font-medium`.

5. **Formulários e Inputs**:
   - Rótulos (Labels): `block text-xs font-semibold text-slate-700 mb-1.5` (`.sq-label`).
   - Campos de entrada: `w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900` (`.sq-input`).

Consulte `.agents/rules/UI_DESIGN_SYSTEM.md` e `src/index.css` para todas as classes e especificações.
