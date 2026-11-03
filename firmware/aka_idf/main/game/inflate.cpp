/*
  inflate.cpp — decodeur deflate minimal (blocs stockes, Huffman fixe et dynamique), dans l'esprit de « tinf ».
  Les images de decor sont compressees par scripts/gen-aka-art.mjs et decompressees en PSRAM au choix de la table.
*/
#include "inflate.h"
#include <string.h>

namespace pinball {

namespace {

struct Tree {
    uint16_t counts[16];
    uint16_t symbols[288];
};

struct State {
    const uint8_t* src;
    size_t srcLen, srcPos;
    uint32_t bitBuf;
    int bitCnt;
    uint8_t* dst;
    size_t dstCap, dstPos;
    bool err;
};

int get_bit(State& s) {
    if (s.bitCnt == 0) {
        if (s.srcPos >= s.srcLen) { s.err = true; return 0; }
        s.bitBuf = s.src[s.srcPos++];
        s.bitCnt = 8;
    }
    const int b = (int)(s.bitBuf & 1u);
    s.bitBuf >>= 1;
    s.bitCnt--;
    return b;
}

uint32_t get_bits(State& s, int n) {
    uint32_t v = 0;
    for (int i = 0; i < n; i++) v |= (uint32_t)get_bit(s) << i;
    return v;
}

void build_tree(Tree& t, const uint8_t* lengths, unsigned num) {
    uint16_t offs[16];
    memset(t.counts, 0, sizeof(t.counts));
    for (unsigned i = 0; i < num; i++) t.counts[lengths[i]]++;
    t.counts[0] = 0;
    unsigned sum = 0;
    for (int i = 0; i < 16; i++) { offs[i] = (uint16_t)sum; sum += t.counts[i]; }
    for (unsigned i = 0; i < num; i++) if (lengths[i]) t.symbols[offs[lengths[i]]++] = (uint16_t)i;
}

int decode_symbol(State& s, const Tree& t) {
    int sum = 0, cur = 0, len = 0;
    do {
        cur = 2 * cur + get_bit(s);
        if (s.err) return -1;
        len++;
        sum += t.counts[len];
        cur -= t.counts[len];
    } while (cur >= 0 && len < 15);
    if (cur >= 0) { s.err = true; return -1; }
    return t.symbols[sum + cur];
}

const uint16_t LEN_BASE[29] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258};
const uint8_t LEN_EXTRA[29] = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0};
const uint16_t DIST_BASE[30] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577};
const uint8_t DIST_EXTRA[30] = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13};

void inflate_block(State& s, const Tree& lt, const Tree& dt) {
    for (;;) {
        const int sym = decode_symbol(s, lt);
        if (s.err) return;
        if (sym < 256) {
            if (s.dstPos >= s.dstCap) { s.err = true; return; }
            s.dst[s.dstPos++] = (uint8_t)sym;
        } else if (sym == 256) {
            return;
        } else {
            const int li = sym - 257;
            if (li >= 29) { s.err = true; return; }
            const unsigned length = LEN_BASE[li] + get_bits(s, LEN_EXTRA[li]);
            const int di = decode_symbol(s, dt);
            if (s.err || di < 0 || di >= 30) { s.err = true; return; }
            const unsigned dist = DIST_BASE[di] + get_bits(s, DIST_EXTRA[di]);
            if (dist > s.dstPos || s.dstPos + length > s.dstCap) { s.err = true; return; }
            for (unsigned i = 0; i < length; i++) { s.dst[s.dstPos] = s.dst[s.dstPos - dist]; s.dstPos++; }
        }
    }
}

} // namespace

long inflate_raw(const uint8_t* src, size_t srcLen, uint8_t* dst, size_t dstCap) {
    State s = {src, srcLen, 0, 0, 0, dst, dstCap, 0, false};
    static Tree fixedL, fixedD;
    static bool fixedReady = false;
    if (!fixedReady) {
        uint8_t l[288];
        for (int i = 0; i < 144; i++) l[i] = 8;
        for (int i = 144; i < 256; i++) l[i] = 9;
        for (int i = 256; i < 280; i++) l[i] = 7;
        for (int i = 280; i < 288; i++) l[i] = 8;
        build_tree(fixedL, l, 288);
        uint8_t d[30];
        for (int i = 0; i < 30; i++) d[i] = 5;
        build_tree(fixedD, d, 30);
        fixedReady = true;
    }
    int final;
    do {
        final = get_bit(s);
        const uint32_t type = get_bits(s, 2);
        if (s.err) return -1;
        if (type == 0) {
            s.bitCnt = 0;
            if (s.srcPos + 4 > s.srcLen) return -1;
            const unsigned len = s.src[s.srcPos] | (s.src[s.srcPos + 1] << 8);
            s.srcPos += 4;
            if (s.srcPos + len > s.srcLen || s.dstPos + len > s.dstCap) return -1;
            memcpy(s.dst + s.dstPos, s.src + s.srcPos, len);
            s.srcPos += len; s.dstPos += len;
        } else if (type == 1) {
            inflate_block(s, fixedL, fixedD);
        } else if (type == 2) {
            static Tree lt, dt;
            const unsigned hlit = get_bits(s, 5) + 257, hdist = get_bits(s, 5) + 1, hclen = get_bits(s, 4) + 4;
            uint8_t lengths[320];
            memset(lengths, 0, sizeof(lengths));
            static const uint8_t ORDER[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};
            for (unsigned i = 0; i < hclen; i++) lengths[ORDER[i]] = (uint8_t)get_bits(s, 3);
            Tree ct;
            build_tree(ct, lengths, 19);
            unsigned num = 0;
            while (num < hlit + hdist) {
                const int sym = decode_symbol(s, ct);
                if (s.err) return -1;
                uint8_t prev = 0; unsigned rep = 0;
                if (sym < 16) { lengths[num++] = (uint8_t)sym; continue; }
                if (sym == 16) { if (num == 0) return -1; prev = lengths[num - 1]; rep = 3 + get_bits(s, 2); }
                else if (sym == 17) { rep = 3 + get_bits(s, 3); }
                else { rep = 11 + get_bits(s, 7); }
                if (num + rep > hlit + hdist) return -1;
                while (rep--) lengths[num++] = prev;
            }
            build_tree(lt, lengths, hlit);
            build_tree(dt, lengths + hlit, hdist);
            inflate_block(s, lt, dt);
        } else {
            return -1;
        }
        if (s.err) return -1;
    } while (!final);
    return (long)s.dstPos;
}

} // namespace pinball
