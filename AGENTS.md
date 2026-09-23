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

---

## 🛑 CONTROLE DE TESTES VISUAIS E DE BROWSER (REGRA DO LUCAS)

- O teste de browser/DOM (subagente de navegação, captura visual ou inspeção DOM) **NUNCA deve ser executado de forma automática**.
- Execute testes via browser/DOM **EXCLUSIVAMENTE** quando o Lucas pedir explicitamente (ex: *"faça o teste no browser"*, *"teste o DOM"*, *"teste a tela"*).
- Para verificações rotineiras e seguras de entrega de código, utilize validação estática (`npm run build` / `tsc`) e testes unitários sem abrir ou inspecionar o navegador sem permissão.

---

## 🏷️ DIRETRIZ DE CATEGORIZAÇÃO OFICIAL DE PRODUTOS (REGRA DO LUCAS)

Todo e qualquer produto novo cadastrado, importado ou descoberto por IA/NCM deve ser classificado OBRIGATORIAMENTE em uma das seguintes categorias oficiais:

1. **Informática, Hardware & Periféricos** (SSDs, pendrives, teclados, mouses, tablets, suportes, peças de informática)
2. **Redes, Conectividade & Telefonia** (switches, roteadores, cabos de rede Furukawa, keystones, patch cords, HDMI, Starlink, telefones IP)
3. **Áudio, Vídeo & Apresentação** (projetores, webcams, gimbals, microfones, headsets, iluminação de estúdio/softbox)
4. **Monitores, Displays & TVs** (monitores para PC, telas de projeção, Smart TVs, antenas HDTV)
5. **Energia, Nobreaks & Baterias** (nobreaks, pilhas AA/AAA, baterias 9V, carregadores de pilhas, testadores)
6. **Impressão & Automação Comercial** (impressoras de etiquetas térmicas, leitores de código de barras, rotuladores, laminadoras térmicas, sistemas de pagers)
7. **Papelaria, Artes & Material de Escritório** (canetas, lápis, giz, tintas artísticas/telas, pincéis, pranchetas, binders, clipes)
8. **Elétrica & Iluminação Tática** (cabos flexíveis Corfio, eletrodutos, caixas de luz de embutir, lanternas táticas)
9. **Construção, Acabamento & Marcenaria** (cimento, areia, massas PVA/acrílica, tintas de parede, gesso, piso vinílico, rodapés, MDF, parafusos, buchas)
10. **Ferramentas & Instrumentos de Medição** (alicates, chaves combinadas, serras, parafusadeiras, trenas, termômetros com calibração RBC, carrinhos de transporte)
11. **Equipamentos & Insumos Industriais** (seringas industriais Nordson, pontas/agulhas dosadoras, lentes de laser CO2, filamentos 3D)
12. **Eletrodomésticos, Refrigeração & Copa** (geladeiras, frigobares, cooktops, chaleiras elétricas, chuveiros, organizadores de pia, cumbucas)
13. **Limpeza, Higiene & Descartáveis** (álcool 70%, dispensers/refis de odores sanitários, estopas, borrifadores, assentos sanitários)
14. **Pet Shop & Veterinária** (rações secas/úmidas, caminhas pet, acessórios para animais)
15. **Diversos & Sazonais** (itens sazonais ou excepcionais que não se enquadram nos departamentos acima)

**PROIBIDO**: Criar categorias fragmentadas (ex: "Armazenamento & SSDs", "Periféricos & Cabos", "Refrigeração, Geladeiras & Frigobares", "Ferramentas Elétricas"). Use sempre os macro-departamentos oficiais acima.

