# SMARTQUOTE UI DESIGN SYSTEM — IDENTIDADE OFICIAL: COMMERCIAL TITANIUM

> **IDENTIDADE VISUAL OFICIAL: COMMERCIAL TITANIUM (APROVADA PELO LUCAS)**
> O SmartQuote utiliza exclusivamente o padrão **Commercial Titanium**:
> - **Barra Superior (Navbar)**: Dark Gunmetal Navy (`#0f172a` / `#1e293b`), com cápsula de navegação integrada em `#1e293b` e bordas `#334155`.
> - **Acentos de Navegação & Ícones**: Ouro Âmbar (`#d97706` / `#f59e0b`) nas abas ativas e botões de destaque.
> - **Canvas & Superfície**: Titânio Quente Escovado (`#eceff3`) com cartões em Branco Puro (`#ffffff`) e bordas sólidas metálicas (`#cbd5e1`).
> - **Botões Oficiais**: Primário em Ouro Âmbar (`bg-amber-600 hover:bg-amber-700`), Secundário Técnico em Azul Cobalto (`bg-blue-700 hover:bg-blue-800`), e Neutros em Titânio/Branco (`#ffffff` / `#f1f5f9`).
> - **Zero Placeholders**: É estritamente proibido o uso do atributo `placeholder` em qualquer campo de entrada do sistema.
> - **Navbar Centralizada**: Menu flutuante distribuído equilibradamente sem logos antigos e com espaço dedicado ao contador de rascunhos.
>
> **REGRA DE OURO (VÁLIDA PARA TUDO QUE EXISTE E TUDO QUE FOR CRIADO DAQUI PARA A FRENTE):**
> Toda e qualquer tela, componente, modal, tabela, card, formulário ou botão do SmartQuote DEVE seguir estritamente o padrão visual estabelecido na tela oficial de **Nova Proposta Comercial**:
> - Títulos e tópicos sempre marcados em negrito (`font-bold` / `font-black text-slate-900`) com ícone identificador correspondente.
> - Botões padronizados em altura (~40px), cantos arredondados (`rounded-xl`), texto em negrito (`text-xs font-bold`) e paleta semântica oficial.
> - Cards de métricas com rótulo superior em caixa alta (`text-[11px] font-bold uppercase tracking-wider text-slate-500`), valor em destaque (`text-base font-bold text-slate-900 font-mono`) e subtítulo informativo.
> - Inputs com cantos `rounded-xl`, bordas suaves (`border-slate-300`), fundo limpo e rótulos (`labels`) destacados em `text-xs font-semibold text-slate-700`.

---

## 1. HIERARQUIA TIPOGRÁFICA OFICIAL (ESCALA HARMÔNICA DE 5 DEGRAUS)

| Degrau | Tamanho | Classes Tailwind | Uso Obrigatório |
|---|---|---|---|
| **1. Destaque Numérico** | `20px` / `24px` | `text-xl` / `text-2xl font-black font-mono tracking-tight` | Total Geral da Proposta Comercial e métricas financeiras de destaque principal. |
| **2. Título de Página (H1)** | `18px` | `text-lg md:text-xl font-bold text-slate-900 tracking-tight` (`.sq-page-title`) | Título principal de cada módulo ("Nova Proposta Comercial", "Catálogo de Produtos"). |
| **3. Tópico de Seção (H2)** | `14px` | `text-sm font-bold text-slate-900 flex items-center gap-2` (`.sq-section-title`) | Títulos de agrupamentos internos sempre acompanhados de ícone colorido (`.sq-section-icon`). |
| **4. Texto Padrão de Trabalho** | `12px` | `text-xs font-semibold/bold/medium` | **80% do sistema**: nomes de produtos, inputs (`.sq-input`), botões de ação e tabelas. |
| **5. Micro-dados & Badges** | `10px` | `text-[10px] font-mono/bold/uppercase tracking-wider` | Badges de código (`.sq-badge-code`), tags SKU, NCM, rótulos de métricas (`.sq-metric-label`) e legendas. |

---

## 2. PADRÃO DE BOTÕES OFICIAIS

Todos os botões têm altura uniforme (~38px a 42px), `rounded-xl`, `font-bold text-xs sm:text-sm`, `flex items-center gap-2 cursor-pointer transition active:scale-95`.

| Tipo | Classes Tailwind | Uso Recomendado |
|---|---|---|
| **Neutro / Rascunho** | `px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs` (`.sq-btn-neutral`) | "Salvar", "Voltar", "Cancelar", "Limpar" |
| **Secundário / Excel Outlined** | `px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs` (`.sq-btn-excel`) | "Salvar Excel", "Exportar", "Baixar Planilha" |
| **Primário Azul (Ação Principal)** | `px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs` (`.sq-btn-primary`) | "Visualizar proposta", "Pesquisar", "Identificar Produto" |
| **Primário Verde (Conclusão / Envio)** | `px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs` (`.sq-btn-emerald`) | "Enviar e-mail", "Finalizar Cotação", "Aprovar" |

---

## 3. CARDS DE MÉTRICAS (DASHBOARD)

Os cards de resumo financeiro e estatísticas devem seguir sempre esta estrutura:
```html
<div class="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
  <div class="flex items-center justify-between text-slate-500 mb-1">
    <span class="text-[11px] font-semibold uppercase tracking-wider">CUSTO PRODUTOS</span>
    <Icon className="w-4 h-4 text-slate-400" />
  </div>
  <p class="text-base font-bold text-slate-900 font-mono">R$ 0,00</p>
  <span class="text-[10px] text-slate-400 font-medium">Preço de compra fornecedor</span>
</div>
```

---

## 4. FORMULÁRIOS & INPUTS

- **Campos de Texto**:
  `w-full h-10 px-3.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 transition outline-none font-sans`
- **Containers de Formulário**:
  `bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs`
- **Ícones Internos**:
  Ícones de inputs sempre em `text-slate-400` ou `text-sky-500`.

---

## 5. REGRAS PARA O AGENTE (ATLAS / SHIVA / HADES)

1. **PROIBIDO** criar botões quadrados (`rounded-none` ou `rounded-sm`) ou botões pílula exagerados (`rounded-full`) a menos que sejam badges de contagem.
2. **PROIBIDO** criar títulos de seções desbotados ou sem negrito. Tópicos são SEMPRE em negrito (`font-bold text-slate-900`) com ícone correspondente.
3. **PROIBIDO** criar botões com alturas desproporcionais; todos devem seguir o padrão `py-2.5 px-3.5` a `px-4`.
4. **SEMPRE** utilizar as classes do design system (`.sq-*`) ou os equivalentes exatos em Tailwind definidos neste documento.
