#include "sfx_patterns.h"

namespace pinball {

namespace {

struct B {
    Pattern& p;
    B& add(uint16_t at, float f0, float f1, float v0, float v1, uint16_t dur, Wave w) {
        if (p.count < MAX_NOTES) p.n[p.count++] = {at, f0, f1, v0, v1, dur, (uint8_t)w};
        return *this;
    }
    // Arpege : notes de meme duree, a intervalles reguliers
    B& arp(const float* fs, int n, uint16_t step, uint16_t dur, float v, Wave w) {
        for (int i = 0; i < n; i++) add((uint16_t)(i * step), fs[i], fs[i], v, v * 0.15f, dur, w);
        return *this;
    }
};

void classic(Pattern& p, Sfx id, uint8_t arg) {
    B b{p};
    switch (id) {
        case Sfx::MenuMove:  b.add(0, 520, 780, 0.45f, 0.05f, 45, WAVE_TRIANGLE); break;
        case Sfx::MenuOk: { float f[3] = {660, 880, 1100}; b.arp(f, 3, 55, 70, 0.5f, WAVE_SINE); break; }
        case Sfx::Pause:     b.add(0, 700, 400, 0.45f, 0.05f, 90, WAVE_TRIANGLE); break;
        case Sfx::Resume:    b.add(0, 400, 700, 0.45f, 0.05f, 90, WAVE_TRIANGLE); break;
        case Sfx::Confirm:   b.add(0, 660, 660, 0.4f, 0.1f, 45, WAVE_SQUARE).add(70, 660, 660, 0.4f, 0.1f, 45, WAVE_SQUARE); break;
        case Sfx::Flipper:   // « clac » : coup sec grave + craquement
            b.add(0, arg ? 160.0f : 145.0f, arg ? 380.0f : 350.0f, 0.8f, 0.05f, 55, WAVE_TRIANGLE).add(0, 900, 300, 0.3f, 0.02f, 25, WAVE_NOISE);
            break;
        case Sfx::Launch: {  // ressort relache : montee rapide, d'autant plus aigue que la tension est forte
            float base = 95.0f + (float)arg * 0.6f;
            b.add(0, base, base * 3.4f, 0.8f, 0.05f, 160, WAVE_SQUARE).add(0, 600, 200, 0.35f, 0.02f, 90, WAVE_NOISE);
            break;
        }
        case Sfx::Bumper: {  // chaque bumper a sa hauteur ; sinus + sous-harmonique carree
            float up = (float)(arg % 6) * 55.0f;
            b.add(0, 680 + up, 290 + up * 0.5f, 0.9f, 0.05f, 95, WAVE_SINE).add(0, 190, 75, 0.5f, 0.02f, 60, WAVE_SQUARE);
            break;
        }
        case Sfx::Sling:     b.add(0, 420, 160, 0.6f, 0.05f, 65, WAVE_SQUARE).add(0, 800, 200, 0.3f, 0.02f, 40, WAVE_NOISE); break;
        case Sfx::Ramp: { float f[4] = {440, 554, 659, 880}; b.arp(f, 4, 55, 140, 0.7f, WAVE_SINE); break; }
        case Sfx::LockLit: { float f[3] = {988, 1319, 1976}; b.arp(f, 3, 70, 90, 0.55f, WAVE_TRIANGLE); break; }
        case Sfx::Lock:      b.add(0, 800, 300, 0.7f, 0.05f, 160, WAVE_SINE).add(0, 150, 60, 0.7f, 0.02f, 120, WAVE_NOISE); break;
        case Sfx::Multiball: {
            float f[6] = {392, 494, 587, 784, 988, 1175};
            b.arp(f, 6, 70, 130, 0.75f, WAVE_TRIANGLE).add(450, 500, 1800, 0.7f, 0.05f, 260, WAVE_SQUARE);
            break;
        }
        case Sfx::Mission: { float f[3] = {523, 659, 784}; b.arp(f, 3, 90, 160, 0.8f, WAVE_TRIANGLE); break; }
        case Sfx::Finale: {
            float f[6] = {523, 659, 784, 1047, 784, 1319};
            b.arp(f, 6, 100, 200, 0.9f, WAVE_TRIANGLE);
            break;
        }
        case Sfx::Nudge:     b.add(0, 300, 90, 0.5f, 0.02f, 70, WAVE_NOISE).add(0, 90, 60, 0.5f, 0.02f, 60, WAVE_SQUARE); break;
        case Sfx::Tilt: {
            for (int i = 0; i < 4; i++) b.add((uint16_t)(i * 160), 220, 200, 0.7f, 0.5f, 130, WAVE_SQUARE);
            break;
        }
        case Sfx::Drain:     b.add(0, 400, 110, 0.7f, 0.05f, 450, WAVE_SQUARE); break;
        case Sfx::NewBall:   b.add(0, 440, 660, 0.45f, 0.1f, 90, WAVE_TRIANGLE); break;
        case Sfx::GameOver:  b.add(0, 400, 100, 0.8f, 0.05f, 700, WAVE_SQUARE); break;
        case Sfx::NewRecord: {
            float f[6] = {523, 659, 784, 1047, 1319, 1568};
            b.arp(f, 6, 110, 220, 0.85f, WAVE_TRIANGLE);
            break;
        }
        case Sfx::None: break;
    }
}

// Plateau Star Wars : blasters, sabres laser, droide, saut en hyperespace. Tout est synthetise :
// aucune musique ni aucun echantillon de la saga n'est utilise.
void starwars(Pattern& p, Sfx id, uint8_t arg) {
    B b{p};
    switch (id) {
        case Sfx::Bumper: {  // tir de blaster : descente rapide + claquage
            float top = 1800.0f + (float)(arg % 6) * 90.0f;
            b.add(0, top, 170, 0.85f, 0.05f, 130, WAVE_SQUARE).add(0, 2400, 400, 0.25f, 0.02f, 25, WAVE_NOISE);
            break;
        }
        case Sfx::Sling:     b.add(0, 1000, 260, 0.7f, 0.05f, 85, WAVE_SQUARE).add(40, 700, 200, 0.4f, 0.02f, 60, WAVE_SQUARE); break;
        case Sfx::Flipper:   // servo d'un volet de croiseur
            b.add(0, arg ? 120.0f : 105.0f, arg ? 300.0f : 270.0f, 0.75f, 0.05f, 60, WAVE_TRIANGLE).add(0, 1200, 500, 0.25f, 0.02f, 30, WAVE_NOISE);
            break;
        case Sfx::Ramp:      // sabre laser : deux lames legerement desaccordees qui balaient
            b.add(0, 110, 320, 0.55f, 0.55f, 200, WAVE_TRIANGLE).add(0, 116, 336, 0.5f, 0.5f, 200, WAVE_SQUARE)
             .add(200, 320, 150, 0.5f, 0.02f, 240, WAVE_TRIANGLE).add(200, 336, 158, 0.45f, 0.02f, 240, WAVE_SQUARE);
            break;
        case Sfx::LockLit: { // gazouillis de droide
            b.add(0, 1200, 2300, 0.5f, 0.2f, 60, WAVE_SINE).add(70, 2300, 1500, 0.5f, 0.2f, 60, WAVE_SINE)
             .add(140, 1500, 2600, 0.5f, 0.2f, 60, WAVE_SINE).add(210, 2600, 1100, 0.5f, 0.1f, 80, WAVE_SINE);
            break;
        }
        case Sfx::Lock:      b.add(0, 90, 50, 0.9f, 0.05f, 220, WAVE_SQUARE).add(0, 300, 80, 0.5f, 0.02f, 140, WAVE_NOISE); break;
        case Sfx::Multiball: // saut en hyperespace : etirement des etoiles, puis claquement
            b.add(0, 60, 2600, 0.5f, 0.9f, 560, WAVE_SQUARE).add(0, 80, 1400, 0.4f, 0.7f, 560, WAVE_TRIANGLE)
             .add(560, 1500, 60, 0.9f, 0.02f, 200, WAVE_NOISE);
            break;
        case Sfx::Mission: { float f[3] = {392, 587, 784}; b.arp(f, 3, 110, 220, 0.85f, WAVE_TRIANGLE); break; }   // quinte + octave, heroique
        case Sfx::Finale: {
            float f[6] = {392, 587, 784, 587, 784, 1175};
            b.arp(f, 6, 120, 260, 0.9f, WAVE_TRIANGLE);
            b.add(0, 98, 98, 0.6f, 0.3f, 720, WAVE_SQUARE);
            break;
        }
        case Sfx::Drain:     b.add(0, 220, 55, 0.8f, 0.05f, 600, WAVE_SQUARE).add(0, 223, 56, 0.6f, 0.05f, 600, WAVE_TRIANGLE); break;
        case Sfx::GameOver:  // trois notes graves, lentes, vers le bas
            b.add(0, 196, 196, 0.8f, 0.4f, 380, WAVE_SQUARE).add(420, 175, 175, 0.8f, 0.4f, 380, WAVE_SQUARE).add(840, 147, 98, 0.85f, 0.05f, 700, WAVE_SQUARE);
            break;
        case Sfx::Launch: {  // moteur ionique qui s'allume
            float base = 70.0f + (float)arg * 0.5f;
            b.add(0, base, base * 4.0f, 0.8f, 0.05f, 180, WAVE_SQUARE).add(0, 900, 150, 0.3f, 0.02f, 100, WAVE_NOISE);
            break;
        }
        case Sfx::NewRecord: {
            float f[6] = {392, 587, 784, 1175, 1568, 1175};
            b.arp(f, 6, 120, 260, 0.9f, WAVE_TRIANGLE);
            break;
        }
        default: classic(p, id, arg); break;
    }
}

// Specialisations thematiques pour les decors hors Star Wars (bumpers et rampes typés par univers).
void themed_override(uint8_t decor, Pattern& p, Sfx id, uint8_t arg) {
    B b{p};
    const float up = (float)(arg % 6) * 48.0f;
    if (id == Sfx::Bumper) {
        switch (decor) {
            case 4: // Classique : cloche electromecanique
                b.add(0, 780 + up, 780 + up, 0.85f, 0.05f, 160, WAVE_SINE)
                 .add(0, 2150 + up * 2.0f, 2150 + up * 2.0f, 0.35f, 0.02f, 65, WAVE_SINE);
                return;
            case 5: // Prehistoire : tambour de pierre
                b.add(0, 240 + up * 0.5f, 68, 0.9f, 0.05f, 115, WAVE_TRIANGLE)
                 .add(0, 620 + up, 290, 0.45f, 0.02f, 40, WAVE_SINE);
                return;
            case 6: // Far West : ricochet western
                b.add(0, 520 + up, 1280 + up, 0.8f, 0.4f, 35, WAVE_SQUARE)
                 .add(35, 1280 + up, 240, 0.65f, 0.03f, 100, WAVE_TRIANGLE);
                return;
            case 7: // Halloween : orgue diminué
                b.add(0, 392 + up, 370 + up, 0.55f, 0.04f, 125, WAVE_SQUARE)
                 .add(0, 554 + up, 520 + up, 0.45f, 0.04f, 125, WAVE_TRIANGLE);
                return;
            case 8: // Candy Pop
            case 9: // Bonbons : bulle acidulee
                b.add(0, 560 + up, 980 + up, 0.8f, 0.05f, 95, WAVE_SINE)
                 .add(20, 1120 + up, 1480 + up, 0.45f, 0.02f, 80, WAVE_TRIANGLE);
                return;
            case 10: // Train : choc d'acier + vapeur
                b.add(0, 310 + up * 0.6f, 95, 0.8f, 0.05f, 85, WAVE_SQUARE)
                 .add(0, 900, 350, 0.38f, 0.02f, 55, WAVE_NOISE);
                return;
            case 3:  // Temple Solaire
            case 11: // Crypte : cristal / cloche de jade
                b.add(0, 587 + up, 587 + up, 0.82f, 0.05f, 145, WAVE_SINE)
                 .add(0, 880 + up, 880 + up, 0.45f, 0.03f, 105, WAVE_TRIANGLE);
                return;
            default:
                break;
        }
    } else if (id == Sfx::Ramp && decor == 10) {
        // Double sifflet de locomotive a vapeur
        b.add(0, 523, 554, 0.6f, 0.1f, 130, WAVE_TRIANGLE)
         .add(0, 659, 698, 0.5f, 0.1f, 130, WAVE_SINE)
         .add(160, 554, 554, 0.65f, 0.05f, 220, WAVE_TRIANGLE)
         .add(160, 698, 698, 0.5f, 0.05f, 220, WAVE_SINE);
        return;
    }
    classic(p, id, arg);
}

} // namespace

void build_pattern(uint8_t decor, Sfx id, uint8_t arg, Pattern& out) {
    out.count = 0;
    if (decor == 2) starwars(out, id, arg);
    else themed_override(decor % 12, out, id, arg);
}

} // namespace pinball
