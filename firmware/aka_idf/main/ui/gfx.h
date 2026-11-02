/*
===============================================================================
  gfx.h — Primitives 2D ecretees, partagees entre la console et le test PC
-------------------------------------------------------------------------------
  Coordonnees ECRAN PAYSAGE : 320 x 240 (le jeu, lui, pense en portrait 240 x 320
  et tourne tout a l'affichage, cf. render.cpp).

  POURQUOI ON ECRETE ICI : lcd_putpixel() du SDK ne controle que l'offset lineaire
  (x + y*320 < 76800). Un pixel a x = 330 n'est donc pas ignore : il reapparait au
  debut de la ligne suivante. Toutes les primitives ci-dessous bornent donc leurs
  coordonnees AVANT d'appeler le pilote ; le pilote ne recoit que du valide.

  Un backend (console : platform/gfx_backend_aka.cpp ; test PC : test/host) fournit
  les 4 fonctions "raw_*" ; tout le reste est ecrit une seule fois ici.
===============================================================================
*/
#pragma once
#include <stdint.h>

namespace vid {

constexpr int W = 320;
constexpr int H = 240;

// --- a fournir par le backend --------------------------------------------------
uint16_t rgb(uint8_t r, uint8_t g, uint8_t b);                    // format materiel
void raw_pixel(int x, int y, uint16_t color);                      // (x, y) dans l'ecran
void raw_fill_rect(int x, int y, int w, int h, uint16_t color);    // rectangle entierement dans l'ecran
void present();

// --- primitives ecretees (gfx_prims.cpp) ---------------------------------------
inline uint16_t rgb888(uint32_t c) { return rgb((uint8_t)(c >> 16), (uint8_t)(c >> 8), (uint8_t)c); }

void clear(uint16_t color);
void fill_rect(int x, int y, int w, int h, uint16_t color);
void rect(int x, int y, int w, int h, uint16_t color);
void line(int x0, int y0, int x1, int y1, uint16_t color);
void circle(int cx, int cy, int r, uint16_t color);
void fill_circle(int cx, int cy, int r, uint16_t color);
void fill_triangle(int x0, int y0, int x1, int y1, int x2, int y2, uint16_t color);

} // namespace vid
