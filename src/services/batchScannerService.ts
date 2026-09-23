/**
 * Batch Scanner Service - Infodesk SmartQuote (MEL-03)
 * Motor de Varredura Concorrente de Múltiplos Produtos com Workers de Segundo Plano
 * Concurrency Pool com controle de taxa e priorização de cache/catálogo local (<5ms).
 */

import { scanSingleProductPrice, ScannedPriceResult } from './priceScannerService';
import { findRecentPriceByPartNumber, savePriceToCache } from './priceCacheService';
import { QuoteItem } from '../types';

export interface BatchItemTarget {
  id: string;
  itemNumber: number;
  name: string;
  partNumber?: string;
  quantity: number;
  currentCost?: number;
}

export type BatchItemStatus = 'pending' | 'searching' | 'cached' | 'found' | 'not_found' | 'error';

export interface BatchItemProgress {
  id: string;
  itemNumber: number;
  name: string;
  status: BatchItemStatus;
  message?: string;
  costPrice?: number;
  supplier?: string;
  buyUrl?: string;
  imageUrl?: string;
  ncm?: string;
  isCached?: boolean;
}

export interface BatchScanOverallProgress {
  total: number;
  completed: number;
  foundCount: number;
  cachedCount: number;
  percent: number;
  isFinished: boolean;
}

export interface BatchScanOptions {
  concurrencyLimit?: number;
  abortSignal?: AbortSignal;
  onItemProgress?: (progress: BatchItemProgress) => void;
  onOverallProgress?: (overall: BatchScanOverallProgress) => void;
}

/**
 * Executa a varredura concorrente em lote de uma lista de itens com pool paralelo
 */
export async function executeConcurrentBatchScan(
  items: BatchItemTarget[],
  options: BatchScanOptions = {}
): Promise<BatchItemProgress[]> {
  const {
    concurrencyLimit = 3,
    abortSignal,
    onItemProgress,
    onOverallProgress
  } = options;

  const total = items.length;
  if (total === 0) {
    onOverallProgress?.({
      total: 0,
      completed: 0,
      foundCount: 0,
      cachedCount: 0,
      percent: 100,
      isFinished: true
    });
    return [];
  }

  const results: BatchItemProgress[] = items.map(it => ({
    id: it.id,
    itemNumber: it.itemNumber,
    name: it.name,
    status: 'pending',
    costPrice: it.currentCost || 0
  }));

  let completedCount = 0;
  let foundCount = 0;
  let cachedCount = 0;

  const notifyOverall = (finished = false) => {
    const percent = Math.min(100, Math.round((completedCount / total) * 100));
    onOverallProgress?.({
      total,
      completed: completedCount,
      foundCount,
      cachedCount,
      percent,
      isFinished: finished
    });
  };

  notifyOverall(false);

  // Pool de concorrência com semáforo de Promises
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      if (abortSignal?.aborted) break;

      const targetIdx = currentIndex++;
      const item = items[targetIdx];
      if (!item) break;

      // 1. Notifica início da busca
      const currentProgress: BatchItemProgress = {
        id: item.id,
        itemNumber: item.itemNumber,
        name: item.name,
        status: 'searching',
        message: 'Pesquisando preços e especificações...'
      };
      results[targetIdx] = currentProgress;
      onItemProgress?.(currentProgress);

      try {
        // 2. Camada 1: Checa cache e histórico por Part Number (0-5ms)
        const pnToSearch = (item.partNumber || item.name || '').trim();
        let cached = await findRecentPriceByPartNumber(pnToSearch);

        // Se o nome tiver código alfanumérico, tenta buscar por ele também
        if (!cached && item.name) {
          const matchCode = item.name.match(/\b([A-Z0-9]{3,}-[A-Z0-9]{2,}|[A-Z0-9]{5,})\b/i);
          if (matchCode) {
            cached = await findRecentPriceByPartNumber(matchCode[1]);
          }
        }

        if (cached && cached.costPrice > 0) {
          cachedCount++;
          foundCount++;
          completedCount++;

          const updated: BatchItemProgress = {
            id: item.id,
            itemNumber: item.itemNumber,
            name: item.name,
            status: 'cached',
            isCached: true,
            costPrice: cached.costPrice,
            supplier: cached.supplier || 'Histórico / Catálogo',
            buyUrl: cached.sourceUrl || '',
            message: `Preço em cache: R$ ${cached.costPrice.toFixed(2)} (${cached.supplier || 'Catálogo'})`
          };
          results[targetIdx] = updated;
          onItemProgress?.(updated);
          notifyOverall(completedCount >= total);
          continue;
        }

        // 3. Camada 2: Varredura Web com IA e Google Search Grounding
        if (abortSignal?.aborted) break;

        const scanResult: ScannedPriceResult = await scanSingleProductPrice(item.name);

        if (scanResult && scanResult.bestPrice > 0) {
          foundCount++;
          completedCount++;

          // Salva no cache para futuras cotações
          const pn = scanResult.partNumber || item.partNumber || item.name;
          savePriceToCache({
            partNumber: pn,
            name: scanResult.standardizedName || item.name,
            supplier: scanResult.store || 'Web',
            costPrice: scanResult.bestPrice,
            sourceUrl: scanResult.buyUrl
          });

          const updated: BatchItemProgress = {
            id: item.id,
            itemNumber: item.itemNumber,
            name: scanResult.standardizedName || item.name,
            status: 'found',
            costPrice: scanResult.bestPrice,
            supplier: scanResult.store || 'Web',
            buyUrl: scanResult.buyUrl,
            imageUrl: scanResult.imageUrl,
            ncm: scanResult.ncm,
            message: `R$ ${scanResult.bestPrice.toFixed(2)} (${scanResult.store || 'Web'})`
          };
          results[targetIdx] = updated;
          onItemProgress?.(updated);
        } else {
          completedCount++;
          const updated: BatchItemProgress = {
            id: item.id,
            itemNumber: item.itemNumber,
            name: item.name,
            status: 'not_found',
            message: 'Não localizado na web'
          };
          results[targetIdx] = updated;
          onItemProgress?.(updated);
        }
      } catch (err: any) {
        completedCount++;
        const updated: BatchItemProgress = {
          id: item.id,
          itemNumber: item.itemNumber,
          name: item.name,
          status: 'error',
          message: err?.message || 'Erro durante a busca'
        };
        results[targetIdx] = updated;
        onItemProgress?.(updated);
      }

      notifyOverall(completedCount >= total);

      // Pequeno intervalo de 100ms para evitar throttle de rede
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Dispara N workers concorrentes
  const activeWorkers: Promise<void>[] = [];
  const actualLimit = Math.min(concurrencyLimit, items.length);

  for (let i = 0; i < actualLimit; i++) {
    activeWorkers.push(worker());
  }

  await Promise.all(activeWorkers);
  notifyOverall(true);

  return results;
}
