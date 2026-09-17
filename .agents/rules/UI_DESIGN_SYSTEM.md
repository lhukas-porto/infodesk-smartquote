# SMARTQUOTE UI DESIGN SYSTEM — DIRETRIZ VISUAL OBRIGATÓRIA

> **REGRA DE OURO (VÁLIDA PARA TUDO QUE EXISTE E TUDO QUE FOR CRIADO DAQUI PARA A FRENTE):**
> Toda e qualquer tela, componente, modal, tabela, card, formulário ou botão do SmartQuote DEVE seguir estritamente o padrão visual estabelecido na tela oficial de **Nova Proposta Comercial**:
> - Títulos e tópicos sempre marcados em negrito (`font-bold` / `font-black text-slate-900`) com ícone identificador correspondente.
> - Botões padronizados em altura (~40px), cantos arredondados (`rounded-xl`), texto em negrito (`text-xs font-bold`) e paleta semântica oficial.
> - Cards de métricas com rótulo superior em caixa alta (`text-[11px] font-semibold uppercase tracking-wider text-slate-500`), valor em destaque (`text-base font-bold text-slate-900 font-mono`) e subtítulo informativo.
> - Inputs com cantos `rounded-xl`, bordas suaves (`border-slate-200`), fundo limpo e rótulos (`labels`) destacados em `text-xs font-semibold text-slate-700`.

---

## 1. HIERARQUIA TIPOGRÁFICA

| Elemento | Classes Tailwind / CSS | Exemplo de Aplicação |
|---|---|---|
| **Título Principal da Página (H1)** | `text-lg md:text-xl font-bold text-slate-900 tracking-tight` (`.sq-page-title`) | "Nova Proposta Comercial", "Scanner Inteligente de Preços" |
| **Badge de Identificação / Código** | `px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold font-mono uppercase tracking-wider rounded-lg` (`.sq-badge-code`) | `COTACAO 160926`, `IA & WEB SEARCH` |
| **Subtítulo Explicativo** | `text-xs text-slate-500 mt-0.5` (`.sq-page-subtitle`) | "Configure os dados do cliente, custos, alíquota de impostos..." |
| **Tópicos de Seção (H2 / H3)** | `text-sm md:text-base font-bold text-slate-900 flex items-center gap-2` (`.sq-section-title`) | "Dados do Solicitante & Identificação", "Itens da Cotação" |
| **Ícones de Tópicos** | `w-4 h-4 text-sky-600 shrink-0` (`.sq-section-icon`) | Ícones de construção, usuário, caminhão, prancheta, lupa |
| **Rótulos de Campo (Labels)** | `block text-xs font-semibold text-slate-700 mb-1.5` (`.sq-label`) | "Empresa / Órgão", "A/C (Nome do Comprador)" |
| **Textos Auxiliares / Pílulas** | `text-[10px] text-slate-400 font-medium` | "Prefixo: À Ao", "Opcional" |

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
