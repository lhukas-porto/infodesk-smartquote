import { CompanySettings, IncomingEmail, Product, Quote } from '../types';
import { defaultCompanySettings, initialEmails, initialProducts, initialSentQuotes } from './mockData';

const SETTINGS_KEY = 'infodesk_settings';
const PRODUCTS_KEY = 'infodesk_products';
const EMAILS_KEY = 'infodesk_emails';
const QUOTES_KEY = 'infodesk_quotes';

export const getSettings = (): CompanySettings => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try { 
      return { ...defaultCompanySettings, ...JSON.parse(saved) }; 
    } catch (e) { console.error(e); }
  }
  return defaultCompanySettings;
};

export const saveSettings = (settings: CompanySettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getProducts = (): Product[] => {
  const saved = localStorage.getItem(PRODUCTS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return initialProducts;
};

export const saveProducts = (products: Product[]): void => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
};

export const getEmails = (): IncomingEmail[] => {
  const saved = localStorage.getItem(EMAILS_KEY);
  if (saved) {
    try {
      const parsed: IncomingEmail[] = JSON.parse(saved);
      const filtered = parsed.filter(e => !['mail-1', 'mail-2', 'mail-3'].includes(e.id));
      return filtered;
    } catch (e) {
      console.error(e);
    }
  }
  return initialEmails;
};

export const saveEmails = (emails: IncomingEmail[]): void => {
  localStorage.setItem(EMAILS_KEY, JSON.stringify(emails));
};

export const getQuotes = (): Quote[] => {
  const saved = localStorage.getItem(QUOTES_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return initialSentQuotes;
};

export const saveQuotes = (quotes: Quote[]): void => {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
};
