import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isUrlConsistentWithSupplier,
  buildStoreSearchUrl,
  reconcileSupplierAndProductUrl,
  buildDirectPurchaseUrl,
  extractStoreNameFromUrl
} from '../utils/aiEmailParser';

describe('Blindagem Universal de Fornecedor x URL (Tolerância Zero a 404 e Links Cruzados)', () => {
  it('1. isUrlConsistentWithSupplier deve detectar conflitos entre fornecedor e URLs de outros domínios', () => {
    // Caso clássico do Lucas: Fornecedor é Compras Paraguai, mas a IA inventou URL da Samsung
    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.samsung.com/br/smartphones/galaxy-s/galaxy-s25-fe/', 'Compras Paraguai'),
      false,
      'Deve rejeitar samsung.com quando o fornecedor apurado é Compras Paraguai'
    );

    // Caso Mercado Livre x Apple
    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.apple.com/br/iphone-16/', 'Mercado Livre'),
      false,
      'Deve rejeitar apple.com quando o fornecedor é Mercado Livre'
    );

    // Caso KaBuM x Dell
    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.dell.com/pt-br/shop/notebooks/', 'KaBuM!'),
      false,
      'Deve rejeitar dell.com quando o fornecedor é KaBuM!'
    );

    // Casos válidos e consistentes
    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.comprasparaguai.com.br/smartphone-samsung-galaxy-s24-fe/', 'Compras Paraguai'),
      true,
      'Deve aprovar link do Compras Paraguai para fornecedor Compras Paraguai'
    );

    assert.strictEqual(
      isUrlConsistentWithSupplier('https://produto.mercadolivre.com.br/MLB-123456-ssd', 'Mercado Livre'),
      true,
      'Deve aprovar link do Mercado Livre'
    );

    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.kabum.com.br/produto/999/teclado', 'KaBuM!'),
      true,
      'Deve aprovar link da KaBuM'
    );

    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.samsung.com/br/smartphones/galaxy-s24/', 'Samsung'),
      true,
      'Deve aprovar link da Samsung quando o fornecedor é a própria Samsung'
    );

    // Quando não há fornecedor especificado, qualquer URL válida é aceita sem conflito
    assert.strictEqual(
      isUrlConsistentWithSupplier('https://www.amazon.com.br/dp/B08XYZ', ''),
      true
    );
  });

  it('2. buildStoreSearchUrl deve gerar URLs oficiais de pesquisa que nunca dão 404', () => {
    const cpSearch = buildStoreSearchUrl('Compras Paraguai', 'Samsung Galaxy S25 FE');
    assert.ok(cpSearch.includes('comprasparaguai.com.br/busca/?q=Samsung%20Galaxy%20S25%20FE'));

    const mlSearch = buildStoreSearchUrl('Mercado Livre', 'Switch Furukawa 24 portas');
    assert.ok(mlSearch.includes('lista.mercadolivre.com.br/Switch-Furukawa-24-portas'));

    const kabumSearch = buildStoreSearchUrl('KaBuM!', 'SSD Kingston 1TB');
    assert.ok(kabumSearch.includes('kabum.com.br/busca/SSD%20Kingston%201TB'));

    const dutraSearch = buildStoreSearchUrl('Dutra Máquinas', 'Trena Bosch 50m');
    assert.ok(dutraSearch.includes('dutramaquinas.com.br/busca?busca=Trena%20Bosch%2050m'));

    const customSearch = buildStoreSearchUrl('Distribuidora Alfa', 'Cabo de Rede Furukawa');
    assert.ok(customSearch.includes('google.com/search') && customSearch.includes('tbm=shop'));
  });

  it('3. reconcileSupplierAndProductUrl deve blindar o caso real do Lucas (Compras Paraguai x Samsung)', () => {
    const result = reconcileSupplierAndProductUrl(
      'Smartphone Samsung Galaxy S25 FE 256GB 5G Tela AMOLED',
      'Compras Paraguai',
      'https://www.samsung.com/br/smartphones/galaxy-s/galaxy-s25-fe/'
    );

    assert.strictEqual(result.supplier, 'Compras Paraguai', 'Deve preservar o fornecedor real apurado');
    assert.strictEqual(result.isSearchFallback, true, 'Deve marcar como fallback seguro de busca');
    assert.ok(
      result.sourceUrl.includes('comprasparaguai.com.br/busca/?q='),
      'A URL deve apontar para o site real do Compras Paraguai, e NÃO para o link quebrado da Samsung'
    );
    assert.ok(!result.sourceUrl.includes('samsung.com'), 'URL da Samsung deve ser completamente expurgada');
  });

  it('4. reconcileSupplierAndProductUrl deve manter URL exata quando compatível', () => {
    const result = reconcileSupplierAndProductUrl(
      'SSD Kingston NV2 1TB',
      'KaBuM!',
      'https://www.kabum.com.br/produto/384931/ssd-1-tb-kingston-nv2'
    );

    assert.strictEqual(result.supplier, 'KaBuM!');
    assert.strictEqual(result.sourceUrl, 'https://www.kabum.com.br/produto/384931/ssd-1-tb-kingston-nv2');
    assert.strictEqual(result.isSearchFallback, false);
  });

  it('5. reconcileSupplierAndProductUrl deve extrair fornecedor se ausente e URL presente', () => {
    const result = reconcileSupplierAndProductUrl(
      'Mouse sem fio Logitech M170',
      '',
      'https://www.kalunga.com.br/prod/mouse-sem-fio-m170-cinza-logitech/442745'
    );

    assert.strictEqual(result.supplier, 'Kalunga');
    assert.strictEqual(result.sourceUrl, 'https://www.kalunga.com.br/prod/mouse-sem-fio-m170-cinza-logitech/442745');
    assert.strictEqual(result.isSearchFallback, false);
  });

  it('6. buildDirectPurchaseUrl com preferredSupplier deve aplicar a blindagem automaticamente', () => {
    const direct = buildDirectPurchaseUrl(
      'Smartphone Samsung Galaxy S25 FE',
      'https://www.samsung.com/br/smartphones/galaxy-s/galaxy-s25-fe/',
      'Compras Paraguai'
    );

    assert.strictEqual(direct.store, 'Compras Paraguai');
    assert.ok(direct.url.includes('comprasparaguai.com.br/busca/?q='));
    assert.ok(!direct.url.includes('samsung.com'));
  });

  it('7. extractStoreNameFromUrl deve reconhecer agregadores e lojas do Paraguai', () => {
    assert.strictEqual(extractStoreNameFromUrl('https://www.comprasparaguai.com.br/produto/123'), 'Compras Paraguai');
    assert.strictEqual(extractStoreNameFromUrl('https://www.lojasparaguai.com.br/item/456'), 'Lojas Paraguai');
    assert.strictEqual(extractStoreNameFromUrl('https://casanissei.com/br/eletronicos'), 'Casa Nissei');
    assert.strictEqual(extractStoreNameFromUrl('https://cellshop.com/br/smartphones'), 'Cellshop');
  });
});
