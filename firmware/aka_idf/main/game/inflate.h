// inflate.h — decompression « raw deflate » (RFC 1951) minimale, sans allocation, pour les images de decor.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace pinball {

// Decompresse `src` (flux deflate brut) dans `dst`. Renvoie le nombre d'octets produits, ou -1 en cas d'erreur
// (flux invalide ou tampon trop petit).
long inflate_raw(const uint8_t* src, size_t srcLen, uint8_t* dst, size_t dstCap);

} // namespace pinball
