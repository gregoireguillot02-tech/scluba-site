# Brand assets — Scluba "The Golfer's Journal"

Dossier dédié aux assets brand (logo lettres bois + photos golfeur+phone) générés Midjourney 2026-05-19.

## Fichiers attendus

| Fichier | Source Midjourney | Usage |
|---|---|---|
| `wordmark-fairway.jpg` | Lettres bois "Scluba" seules sur fairway, bokeh wide | Hero full-bleed background, OG variant |
| `golfer-phone-app.jpg` | Golfeur souriant tenant smartphone avec mockup d'app intégré | Chapitre II — La promesse (section "magic moment") |
| `golfer-phone-greenscreen.jpg` | Même composition que `golfer-phone-app.jpg` mais smartphone en écran vert chroma key | Source pour mettre à jour le mockup quand la webapp évolue |
| `wordmark-flat.jpg` | Lettres bois flat lay sur fond cream uni | OG image partage social, fallback wordmark, favicon source |

## Specs recommandées

- **Format** : jpg progressive ou webp (préférer webp si disponible)
- **Largeur** : 2400px minimum pour le hero, 1920px pour le reste (sera resservi par Astro Image)
- **Compression** : qualité 85% suffisante pour le web
- **Color profile** : sRGB (pas de profile P3 wide gamut sinon couleurs cassées sur Chrome ancien)

## Pourquoi un dossier dédié

`public/photos/` contient les photos des clubs partenaires (Golf du Soleil, Caen-la-Mer). `public/logos/` contient les logos officiels des clubs. `public/brand/` sépare clairement nos propres assets brand (Scluba) du contenu fourni par les clubs.

## Variantes à générer plus tard (out of scope PR #1)

- Versions webp et avif pour `<picture>` source sets
- Versions cropped 1200×630 OG image
- Versions cropped 16:9, 4:3, 1:1 pour différents usages
