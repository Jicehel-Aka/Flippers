// Test hôte du firmware : inclut main.cpp tel quel (setup/loop + fonctions statiques) et le fait
// tourner avec des mocks. Les boutons sont pilotés via g_pins[] (1 = enfoncé, GPIO du HAL).
#include "Arduino.h"
#include "LovyanGFX.hpp"

uint32_t g_micros = 0;
int g_pins[64] = {0};
SerialMock Serial;
long lgfx::g_pushes = 0;
long lgfx::g_spriteFail = 0;

#include "../../src/main.cpp"

static int g_failures = 0;
#define CHECK(cond, ...)                                  \
  do {                                                    \
    if (cond) {                                           \
      printf("  ok   : ");                                \
    } else {                                              \
      printf("  ECHEC: ");                                \
      g_failures++;                                       \
    }                                                     \
    printf(__VA_ARGS__);                                  \
    printf("\n");                                         \
  } while (0)

static void frames(int n, int us = 17000) {
  for (int i = 0; i < n; i++) {
    g_micros += us;
    loop();
  }
}

static void tap(int pin, int holdFrames = 2) {
  g_pins[pin] = 1;
  frames(holdFrames);
  g_pins[pin] = 0;
  frames(2);
}

enum { BTN_A = 32, BTN_D = 33, BTN_B = 27, BTN_C = 14, BTN_R1 = 13 };
enum { ST_MENU = 0, ST_PLAYING = 1, ST_PAUSED = 2, ST_GAMEOVER = 3 };

int main() {
  setup();

  printf("[1] Démarrage et menu\n");
  CHECK(aka_test_state() == ST_MENU, "démarre sur le menu");
  CHECK(aka_test_wall_count() > 0 && aka_test_wall_count() <= MAX_WALLS, "%d murs (capacité %d)", aka_test_wall_count(), (int)MAX_WALLS);
  tap(BTN_R1);
  CHECK(aka_test_state() == ST_PLAYING, "R1 lance la partie");

  printf("[2] Pause : confirmations en deux temps\n");
  tap(BTN_C);
  CHECK(aka_test_state() == ST_PAUSED, "C met en pause");
  tap(BTN_B);
  CHECK(aka_test_state() == ST_PAUSED, "un seul B ne relance pas la partie");
  tap(BTN_B);
  CHECK(aka_test_state() == ST_PLAYING && aka_test_score() == 0, "second B : nouvelle partie");
  tap(BTN_C);
  tap(BTN_A);
  CHECK(aka_test_state() == ST_PAUSED, "un seul A ne quitte pas au menu");
  tap(BTN_C);
  CHECK(aka_test_state() == ST_PLAYING, "C reprend la partie");

  printf("[3] Pas physique fixe : chute libre identique à 25/33/50/100 FPS (0,24 s simulées)\n");
  const int dts[4] = {40000, 30000, 20000, 10000};
  float finalX[4], finalY[4];
  for (int k = 0; k < 4; k++) {
    startNewGame(0);
    introTimer = 0.0f;
    balls[0] = {140.0f, 150.0f, 10.0f, 0.0f, true, false, 0.0f, 0.0f};
    float dt = dts[k] * 1e-6f;
    int n = 240000 / dts[k];
    for (int i = 0; i < n; i++) updateGameFrame(dt);
    finalX[k] = balls[0].x;
    finalY[k] = balls[0].y;
  }
  bool same = true;
  for (int k = 1; k < 4; k++) {
    if (fabsf(finalX[k] - finalX[0]) > 0.5f || fabsf(finalY[k] - finalY[0]) > 0.5f) same = false;
  }
  CHECK(same, "position finale : (%.2f,%.2f) (%.2f,%.2f) (%.2f,%.2f) (%.2f,%.2f)",
        finalX[0], finalY[0], finalX[1], finalY[1], finalX[2], finalY[2], finalX[3], finalY[3]);

  printf("[4] Partie sans flippers : aucune bille ne doit rester bloquée\n");
  startNewGame(0);
  long pushes0 = lgfx::g_pushes;
  int i = 0;
  for (; i < 60000 && aka_test_state() == ST_PLAYING; i++) {
    frames(1);
    if (i % 90 == 0) g_pins[BTN_R1] = 1;
    if (i % 90 == 50) g_pins[BTN_R1] = 0;
  }
  g_pins[BTN_R1] = 0;
  CHECK(aka_test_state() == ST_GAMEOVER, "fin de partie atteinte après ~%d s de jeu", i * 17 / 1000);
  printf("       trafic SPI : %.2f envois de sprite par image (HUD non renvoyé tant qu'il ne change pas)\n",
         (double)(lgfx::g_pushes - pushes0) / (double)(i > 0 ? i : 1));

  printf("[5] Écran de fin de partie\n");
  tap(BTN_B);
  CHECK(aka_test_state() == ST_GAMEOVER, "B immédiat ignoré (anti-rebond)");
  frames(90);
  tap(BTN_B);
  CHECK(aka_test_state() == ST_PLAYING, "B après 1,5 s : on rejoue");

  printf("\n%s (%d échec(s))\n", g_failures ? "ECHEC" : "SUCCES", g_failures);
  return g_failures ? 1 : 0;
}
