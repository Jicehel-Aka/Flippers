// Backend graphique de la console : gb_graphics (framebuffer unique en SRAM, cf. ZERO_BUFFER_PSRAM).
// vid_prims.cpp / gfx_prims.cpp ecretent TOUT avant d'arriver ici (lcd_putpixel() du SDK ne controle
// que l'offset lineaire : un pixel a x = 330 reapparaitrait au debut de la ligne suivante).
#include "../ui/gfx.h"
#include "gb_graphics.h"

gb_graphics gfx;   // instance unique, utilisee aussi par le menu systeme d'aka_runtime

namespace vid {

uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) { return gfx.makeColor(r, g, b); }
void raw_pixel(int x, int y, uint16_t color) { gfx.drawPixel((int16_t)x, (int16_t)y, color); }
void raw_fill_rect(int x, int y, int w, int h, uint16_t color) {
    gfx.setColor(color);
    gfx.fillRect((int16_t)x, (int16_t)y, (int16_t)w, (int16_t)h);
}
void raw_blit_row(int x, int y, const uint16_t* px, int n) { gfx.drawImage((int16_t)x, (int16_t)y, px, (uint16_t)n, 1); }
// SANS CET APPEL L'ECRAN RESTE NOIR : le framebuffer n'est transfere a la dalle que par update().
void present() { gfx.update(); }

} // namespace vid
