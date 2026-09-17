/**
 * Validador e Catálogo Determinístico de NCMs Oficiais (TIPI / Receita Federal)
 * Foco específico no segmento de Tecnologia da Informação, Redes, Automação e Suprimentos (MEL-04).
 */

export interface OfficialNcmInfo {
  code: string;        // 8 dígitos: '84713019'
  formatted: string;   // '8471.30.19'
  description: string; // Descrição oficial da TIPI
  category: string;    // Categoria interna
}

export const OFFICIAL_TI_NCMS: OfficialNcmInfo[] = [
  // Computadores, Servidores e Portáteis
  { code: '84713012', formatted: '8471.30.12', description: 'Máquinas automáticas de processamento de dados, portáteis (Notebooks/Laptops)', category: 'Computadores' },
  { code: '84713019', formatted: '8471.30.19', description: 'Outras máquinas automáticas portáteis para processamento de dados (Tablets/Ultrabooks)', category: 'Computadores' },
  { code: '84714100', formatted: '8471.41.00', description: 'Computadores de mesa (Desktops / All-in-One) contendo no mesmo corpo CPU, teclado e monitor', category: 'Computadores' },
  { code: '84714900', formatted: '8471.49.00', description: 'Outras máquinas automáticas de processamento apresentadas sob forma de sistemas', category: 'Computadores' },
  { code: '84715010', formatted: '8471.50.10', description: 'Servidores corporativos de grande porte e unidades de processamento de alto desempenho', category: 'Servidores' },
  { code: '84715020', formatted: '8471.50.20', description: 'Pequenos servidores de rede de dados e microcomputadores de gabinete', category: 'Servidores' },
  { code: '84715090', formatted: '8471.50.90', description: 'Outras unidades de processamento de dados digitais de mesa ou montagem em rack', category: 'Servidores' },

  // Redes, Telecom e Conectividade
  { code: '85176254', formatted: '8517.62.54', description: 'Comutadores para redes locais (Switches gerenciáveis e não-gerenciáveis)', category: 'Redes' },
  { code: '85176241', formatted: '8517.62.41', description: 'Roteadores digitais para redes de telecomunicação e transmissão de pacotes', category: 'Redes' },
  { code: '85176277', formatted: '8517.62.77', description: 'Aparelhos emissores com receptor incorporado de tecnologia digital (Access Points / Wi-Fi)', category: 'Redes' },
  { code: '85176255', formatted: '8517.62.55', description: 'Moduladores/demoduladores (Modems ópticos GPON / Roteadores de borda)', category: 'Redes' },
  { code: '85176294', formatted: '8517.62.94', description: 'Transmissores ópticos / Conversores de mídia / Transceivers SFP e SFP+', category: 'Redes' },
  { code: '85176299', formatted: '8517.62.99', description: 'Outros aparelhos para emissão, transmissão ou recepção de voz, imagens ou dados', category: 'Redes' },
  { code: '85444900', formatted: '8544.49.00', description: 'Cabos elétricos para tensão <= 1.000V (Cabos de rede UTP Cat5e/Cat6 e Patch Cords)', category: 'Cabeamento' },
  { code: '85447010', formatted: '8544.70.10', description: 'Cabos de fibras ópticas com revestimento individual para transmissão de dados', category: 'Cabeamento' },
  { code: '85366990', formatted: '8536.69.90', description: 'Conectores RJ-45, Patch Panels montados, Keystone e tomadas de rede', category: 'Cabeamento' },

  // Armazenamento, Memória e Componentes
  { code: '84717040', formatted: '8471.70.40', description: 'Unidades de memória de estado sólido (SSDs NVMe e SATA)', category: 'Armazenamento' },
  { code: '84717010', formatted: '8471.70.10', description: 'Unidades de discos magnéticos rígidos (HDs internos e externos)', category: 'Armazenamento' },
  { code: '84717020', formatted: '8471.70.20', description: 'Unidades de fita magnética para backup de servidores (LTO)', category: 'Armazenamento' },
  { code: '84733041', formatted: '8473.30.41', description: 'Placas de memória RAM (DDR4 / DDR5 para desktops e servidores)', category: 'Componentes' },
  { code: '84733042', formatted: '8473.30.42', description: 'Placas aceleradoras gráficas (Placas de vídeo / GPUs dedicadas)', category: 'Componentes' },
  { code: '84733049', formatted: '8473.30.49', description: 'Placas-mãe (Motherboards) e placas de circuito impresso com componentes', category: 'Componentes' },
  { code: '85423190', formatted: '8542.31.90', description: 'Processadores e controladores (CPUs Intel Xeon, Core, AMD EPYC, Ryzen)', category: 'Componentes' },
  { code: '85044021', formatted: '8504.40.21', description: 'Fontes de alimentação chaveadas para computadores e servidores (Fontes ATX / Redundantes)', category: 'Componentes' },
  { code: '84733099', formatted: '8473.30.99', description: 'Gabinetes, coolers, dissipadores e outros acessórios para máquinas de dados', category: 'Componentes' },

  // Energia e Nobreaks
  { code: '85044040', formatted: '8504.40.40', description: 'Fontes de alimentação ininterrupta de energia (Nobreaks / UPS senoidais e online)', category: 'Energia' },
  { code: '85044010', formatted: '8504.40.10', description: 'Estabilizadores de tensão e reguladores automáticos de voltagem', category: 'Energia' },
  { code: '85072010', formatted: '8507.20.10', description: 'Baterias seladas de chumbo-ácido para nobreaks e bancos de baterias', category: 'Energia' },

  // Periféricos e Monitores
  { code: '85285200', formatted: '8528.52.00', description: 'Monitores capazes de serem conectados diretamente a máquinas de dados (LED/IPS)', category: 'Monitores' },
  { code: '84716052', formatted: '8471.60.52', description: 'Teclados para máquinas de processamento de dados', category: 'Periféricos' },
  { code: '84716053', formatted: '8471.60.53', description: 'Dispositivos apontadores (Mouses ópticos / Touchpads)', category: 'Periféricos' },
  { code: '84716059', formatted: '8471.60.59', description: 'Leitores de código de barras, biometria e scanners de documentos', category: 'Periféricos' },
  { code: '85183000', formatted: '8518.30.00', description: 'Fones de ouvido corporativos com microfone (Headsets USB / P3)', category: 'Periféricos' },
  { code: '85258929', formatted: '8525.89.29', description: 'Câmeras para videoconferência corporativa (Webcams Full HD / 4K)', category: 'Periféricos' },

  // Impressão e Suprimentos
  { code: '84433111', formatted: '8443.31.11', description: 'Impressoras multifuncionais a laser com alimentador automático de papel', category: 'Impressão' },
  { code: '84433222', formatted: '8443.32.22', description: 'Impressoras térmicas não fiscais de cupom e etiquetas (Zebra / Elgin)', category: 'Impressão' },
  { code: '84439923', formatted: '8443.99.23', description: 'Cartuchos de toner para impressoras laser', category: 'Suprimentos' },
  { code: '84439933', formatted: '8443.99.33', description: 'Cartuchos de tinta para impressoras jato de tinta', category: 'Suprimentos' }
];

/**
 * Remove formatação e deixa apenas números
 */
export function cleanNcm(code?: string): string {
  if (!code) return '';
  return code.replace(/[^0-9]/g, '');
}

/**
 * Formata um código NCM para o padrão nacional 0000.00.00
 */
export function formatNcm(code?: string): string {
  const digits = cleanNcm(code);
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

export interface NcmValidationResult {
  isValid: boolean;         // Possui exatamente 8 dígitos numéricos válidos
  isKnown: boolean;         // Encontrado no catálogo oficial de TI
  formatted: string;        // '8471.30.19'
  code: string;             // '84713019'
  description?: string;     // Descrição TIPI
  category?: string;        // Categoria TI
  alertMessage?: string;    // Alerta caso código não seja homologado
}

/**
 * Valida se um NCM informado é válido e identifica a descrição oficial
 */
export function validateNcm(rawCode?: string): NcmValidationResult {
  const code = cleanNcm(rawCode);
  const formatted = formatNcm(code);

  if (code.length !== 8) {
    return {
      isValid: false,
      isKnown: false,
      formatted,
      code,
      alertMessage: code.length === 0 ? 'NCM não informado' : `NCM incompleto (${code.length} de 8 dígitos)`
    };
  }

  const match = OFFICIAL_TI_NCMS.find(n => n.code === code);
  if (match) {
    return {
      isValid: true,
      isKnown: true,
      formatted: match.formatted,
      code: match.code,
      description: match.description,
      category: match.category
    };
  }

  // Código tem 8 dígitos mas é de outra categoria ou não catalogado no preset de TI
  return {
    isValid: true,
    isKnown: false,
    formatted,
    code,
    alertMessage: 'NCM com 8 dígitos válidos, porém fora do catálogo padrão de TI.'
  };
}

/**
 * Pesquisa no catálogo de NCMs por código ou termo textual (para autocomplete)
 */
export function searchNcmOptions(query: string, limit: number = 6): OfficialNcmInfo[] {
  if (!query || query.trim().length === 0) {
    return OFFICIAL_TI_NCMS.slice(0, limit);
  }

  const normQuery = query.toLowerCase().trim();
  const digitsQuery = cleanNcm(query);

  return OFFICIAL_TI_NCMS.filter(item => {
    if (digitsQuery && item.code.includes(digitsQuery)) return true;
    return item.description.toLowerCase().includes(normQuery) || 
           item.category.toLowerCase().includes(normQuery);
  }).slice(0, limit);
}
