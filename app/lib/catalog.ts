// lib/catalog.ts
// Prix Bricoman — juin 2026 (indicatifs, varient selon magasin)
// Mettre à jour prixHT + updatedAt ~1x/an, puis maj disclaimer dans ui

export const TVA = 0.20

export interface CatalogItem {
  id: string
  label: string
  ref: string
  prixHT: number
  tva: typeof TVA
  unite: string
  url: string
  updatedAt: string
}

export function prixTTC(item: CatalogItem): number {
  return +(item.prixHT * (1 + item.tva)).toFixed(2)
}

// ─── Montants ISOLPRO 48/35 ───────────────────────────────────────────────────

export const MONTANTS: CatalogItem[] = [
  {
    id: 'montant-48-250',
    label: 'Montant 48/35 ISOLPRO — 2,50 m',
    ref: '334180',
    prixHT: 1.58,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-2-50-m-nf-isolpro-334180.html',
    updatedAt: '2026-06',
  },
  {
    id: 'montant-48-260',
    label: 'Montant 48/35 ISOLPRO — 2,60 m',
    ref: '731850',
    prixHT: 2.16,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-2-60-m-nf-isolpro-731850.html',
    updatedAt: '2026-06',
  },
  {
    id: 'montant-48-270',
    label: 'Montant 48/35 ISOLPRO — 2,70 m',
    ref: '1165724',
    prixHT: 2.58,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-2-70-m-nf-isolpro-1165724.html',
    updatedAt: '2026-06',
  },
  {
    id: 'montant-48-280',
    label: 'Montant 48/35 ISOLPRO — 2,80 m',
    ref: '1277570',
    prixHT: 4.00,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-2-80-m-nf-isolpro-1277570.html',
    updatedAt: '2026-06',
  },
  {
    id: 'montant-48-300',
    label: 'Montant 48/35 ISOLPRO — 3,00 m',
    ref: '354690',
    prixHT: 1.54,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-3-m-nf-isolpro-354690.html',
    updatedAt: '2026-06',
  },
  {
    id: 'montant-48-400',
    label: 'Montant 48/35 ISOLPRO — 4,00 m',
    ref: '1152970',
    prixHT: 5.42,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/montant-metallique-48-35-mm-long-4-m-nf-isolpro-1152970.html',
    updatedAt: '2026-06',
  },
]

// ─── Rails ISOLPRO 48/28 ──────────────────────────────────────────────────────

export const RAILS: CatalogItem[] = [
  {
    id: 'rail-48-300',
    label: 'Rail 48/28 ISOLPRO — 3,00 m',
    ref: '334194',
    prixHT: 1.58,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/rail-metallique-48-28-mm-long-3-m-nf-isolpro-334194.html',
    updatedAt: '2026-06',
  },
]

// ─── Plaques BA13 ─────────────────────────────────────────────────────────────

export const PLAQUES: CatalogItem[] = [
  {
    id: 'ba13-standard-250x120',
    label: 'Plaque BA13 std LABELPLAC — 250×120 cm',
    ref: '25051986',
    prixHT: 5.18,
    tva: TVA,
    unite: 'pièce',
    url: 'https://www.bricoman.fr/produits/plaque-de-platre-ba13-standard-h-250-x-l-120-cm-nf-labelplac-25051986.html',
    updatedAt: '2026-06',
  },
]

// ─── Visserie ISOLPRO ─────────────────────────────────────────────────────────

export const VISSERIE: CatalogItem[] = [
  {
    id: 'vis-3.5x25-b1000',
    label: 'Vis 3,5×25 ISOLPRO — Boîte 1000',
    ref: '124824',
    prixHT: 6.63,
    tva: TVA,
    unite: 'boîte de 1000',
    url: 'https://www.bricoman.fr/produits/vis-plaque-de-platre-diam-3-5-x-25-mm-boite-de-1000-isolpro-124824.html',
    updatedAt: '2026-06',
  },
]

// ─── Blocs-portes (Bricoman — juin 2026) ─────────────────────────────────────

export const PORTES: CatalogItem[] = [
  {
    id: 'porte-postforme-73-droit',
    label: 'Bloc-porte postformé prépeint — 73 cm poussant droit',
    ref: '1221150',
    prixHT: 42.58,
    tva: TVA,
    unite: 'unité',
    url: 'https://www.bricoman.fr/produits/bloc-porte-postforme-prepeint-larg-73-cm-poussant-droit-alveolaire-huiss-72-mm-1221150.html',
    updatedAt: '2026-06',
  },
  {
    id: 'porte-isoplan-73-gauche',
    label: 'Bloc-porte isoplan prépeint — 73 cm poussant gauche',
    ref: '1221066',
    prixHT: 36.49,
    tva: TVA,
    unite: 'unité',
    url: 'https://www.bricoman.fr/produits/bloc-porte-isoplan-prepeint-larg-73-cm-poussant-gauche-alveolaire-huiss-72-mm-1221066.html',
    updatedAt: '2026-06',
  },
  {
    id: 'porte-isoplan-83-gauche',
    label: 'Bloc-porte isoplan prépeint — 83 cm poussant gauche',
    ref: '1221080',
    prixHT: 59.13,
    tva: TVA,
    unite: 'unité',
    url: 'https://www.bricoman.fr/produits/bloc-porte-isoplan-prepeint-larg-83-cm-poussant-gauche-alveolaire-huiss-72-mm-1221080.html',
    updatedAt: '2026-06',
  },
  {
    id: 'porte-postforme-83-droit',
    label: 'Bloc-porte postformé prépeint — 83 cm poussant droit',
    ref: '1221171',
    prixHT: 80.99,
    tva: TVA,
    unite: 'unité',
    url: 'https://www.bricoman.fr/produits/bloc-porte-postforme-prepeint-larg-83-cm-poussant-droit-alveolaire-huiss-72-mm-1221171.html',
    updatedAt: '2026-06',
  },
]

// ─── Isolation (Bricoman — juin 2026) ────────────────────────────────────────

/** Surface couverte par un paquet Rockmur 14 panneaux 135×60 cm (m²). */
export const ROCKWOOL_PAQUET_M2 = 14 * 1.35 * 0.60  // = 11.34 m²

export const ISOLATION: CatalogItem[] = [
  {
    id: 'rockwool-rockmur-40mm',
    label: 'Laine de roche Rockmur kraft 40mm R1,1 — lot de 14 panneaux (11,34 m²)',
    ref: '25100074',
    prixHT: 51.67,
    tva: TVA,
    unite: 'paquet de 14 panneaux (11,34 m²)',
    url: 'https://www.bricoman.fr/produits/lot-de-14-panneaux-laine-de-roche-rockmur-kraft-ep-40mm-lambda-40-r-1-1-l-135-x-l-60-cm-rockwool-25100074.html',
    updatedAt: '2026-06',
  },
]

// ─── Catalogue complet indexé par id ─────────────────────────────────────────

export const CATALOG: Record<string, CatalogItem> = Object.fromEntries(
  [...MONTANTS, ...RAILS, ...PLAQUES, ...VISSERIE, ...PORTES, ...ISOLATION].map(item => [item.id, item])
)

export const CATALOG_DISCLAIMER =
  'Prix indicatifs Bricoman — juin 2026. Les tarifs varient selon le magasin et peuvent évoluer. Vérifier avant commande.'
