import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  saveProductImageToCache, 
  findProductImageInCache, 
  deduplicateProductsList, 
  mergeRemoteProductsWithLocal,
  recoverProductImagesFromQuotes,
  saveProducts,
  getProducts,
  saveCurrentDraftQuote
} from '../utils/storage';
import { Product, Quote } from '../types';

describe('Blindagem de Fotos Copiadas de Print Screen para o Catálogo', () => {

  it('1. saveProductImageToCache e findProductImageInCache devem indexar e encontrar fotos por nome, PN e SKU', () => {
    const mockImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/mockImageData123';
    
    saveProductImageToCache(
      {
        name: 'Bobina Altaplast picotada reforçada 20x30 com 500 sacos',
        partNumber: 'ALT2030',
        sku: 'ALT2030'
      },
      mockImage
    );

    // Busca por PN
    const byPn = findProductImageInCache(undefined, 'ALT2030');
    assert.strictEqual(byPn, mockImage, 'Deveria encontrar imagem pelo Part Number');

    // Busca por SKU
    const bySku = findProductImageInCache(undefined, undefined, 'ALT2030');
    assert.strictEqual(bySku, mockImage, 'Deveria encontrar imagem pelo SKU');

    // Busca por Nome
    const byName = findProductImageInCache('Bobina Altaplast picotada reforçada 20x30 com 500 sacos');
    assert.strictEqual(byName, mockImage, 'Deveria encontrar imagem pelo Nome do produto');
  });

  it('2. deduplicateProductsList deve SEMPRE preservar a foto e recuperar do cache se ausente', () => {
    const mockImage = 'data:image/jpeg;base64,/9j/mockAlt4060';
    saveProductImageToCache(
      {
        name: 'Bobina Altaplast picotada reforçada 40x60 com 400 sacos',
        partNumber: 'ALT4060',
        sku: 'ALT4060'
      },
      mockImage
    );

    // Produto sem imagem direta na lista
    const prodWithoutImg: Product = {
      id: 'prod-alt-4060',
      sku: 'ALT4060',
      partNumber: 'ALT4060',
      name: 'Bobina Altaplast picotada reforçada 40x60 com 400 sacos',
      description: 'Bobina de sacos picotados reforçados',
      category: 'Limpeza, Higiene & Descartáveis',
      costPrice: 46.07,
      unit: 'Un.',
      stock: 10,
      imageUrl: '',
      lastUpdated: new Date().toISOString()
    };

    const result = deduplicateProductsList([prodWithoutImg]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].imageUrl, mockImage, 'deduplicateProductsList deveria recuperar a foto pelo cache');
  });

  it('3. mergeRemoteProductsWithLocal NUNCA deve sobrescrever foto local com vazio remoto (mesmo com timestamp remoto mais novo)', () => {
    const localImage = 'data:image/jpeg;base64,/9j/photoLocalPrinted';
    
    const localProduct: Product = {
      id: 'prod-local-1',
      sku: 'ALT2030',
      partNumber: 'ALT2030',
      name: 'Bobina Altaplast picotada reforçada 20x30 com 500 sacos',
      description: 'Desenvolvida com padrão de alta qualidade...',
      category: 'Limpeza, Higiene & Descartáveis',
      costPrice: 12.87,
      unit: 'Un.',
      stock: 10,
      imageUrl: localImage,
      lastUpdated: '2026-10-24T10:00:00.000Z'
    };

    // Produto remoto mais novo vindo do Supabase mas sem imagem (image_url = null/'')
    const remoteProductWithoutImage: Product = {
      id: 'prod-local-1',
      sku: 'ALT2030',
      partNumber: 'ALT2030',
      name: 'Bobina Altaplast picotada reforçada 20x30 com 500 sacos',
      description: 'Desenvolvida com padrão de alta qualidade...',
      category: 'Limpeza, Higiene & Descartáveis',
      costPrice: 12.87,
      unit: 'Un.',
      stock: 10,
      imageUrl: '',
      lastUpdated: '2026-10-24T12:00:00.000Z' // 2 horas mais recente!
    };

    const merged = mergeRemoteProductsWithLocal([remoteProductWithoutImage], [localProduct]);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].imageUrl, localImage, 'Foto local DEVE ser mantida intacta mesmo com remoto mais recente sem foto');
  });

  it('4. recoverProductImagesFromQuotes deve resgatar fotos coladas em orçamentos para o cache e catálogo', () => {
    const pastedPhoto = 'data:image/jpeg;base64,/9j/printScreenFromSnippet';
    
    // Simula rascunho de cotação atual com item contendo foto colada
    const mockQuoteDraft = {
      id: 'quote-hospital-santa-lucia',
      code: 'HSL 241026-1',
      clientCompany: 'Hospital Santa Lucia',
      date: '24 de Outubro de 2026',
      status: 'draft',
      items: [
        {
          id: 'item-alt-2030',
          itemNumber: 1,
          name: 'Bobina Altaplast 20x30 Reforçada',
          description: 'Bobina picotada 20x30',
          unit: 'Un.',
          markupPercent: 23.5,
          partNumber: 'ALT2030',
          costPrice: 12.87,
          quantity: 2,
          unitPrice: 16.50,
          totalPrice: 33.00,
          imageUrl: pastedPhoto,
          showImage: true
        }
      ]
    } as unknown as Quote;

    saveCurrentDraftQuote(mockQuoteDraft);

    // Executa resgate
    const recovered = recoverProductImagesFromQuotes();
    assert.ok(recovered >= 1, 'Deveria recuperar pelo menos 1 foto do rascunho de cotação');

    // Confere se o cache agora contém a foto
    const cached = findProductImageInCache('Bobina Altaplast 20x30 Reforçada', 'ALT2030');
    assert.strictEqual(cached, pastedPhoto, 'A foto resgatada do orçamento deve estar acessível no cache');
  });

});
