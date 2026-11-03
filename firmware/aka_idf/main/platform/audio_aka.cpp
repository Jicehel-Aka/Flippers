/*
  audio_aka.cpp — Effets sonores sur le mixeur du SDK (gb_audio_player, 4 pistes)
  -------------------------------------------------------------------------------
  Les 4 pistes servent de VOIX : un flipper joue plusieurs sons a la fois (flipper + bumper + rampe).
  Une seule tache (AudioTask) touche aux pistes : le jeu depose des evenements dans une file FreeRTOS,
  AudioTask les transforme en notes datees (sfx_patterns), les declenche a l'heure dite et fait tourner
  le mixeur toutes les 2 ms. Aucun mutex, aucune course.
*/
#include "platform.h"
#include "../game/sfx_patterns.h"
#include "../game/music.h"
#include "gb_audio_player.h"
#include "gb_audio_track_tone.h"
#include "gb_ll_audio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "aka_runtime/aka_runtime.h"

namespace platform {

namespace {

constexpr int VOICES = AUDIO_PLAYER_TRACK_COUNT;
constexpr int MUSIC_VOICE = VOICES - 1;   // la derniere piste est reservee a la musique ; les effets utilisent les autres
constexpr int SFX_VOICES = VOICES - 1;
constexpr int MAX_PENDING = 32;
constexpr float SFX_VOLUME = 0.85f;

gb_audio_player g_player;
gb_audio_track_tone g_voice[VOICES];
uint32_t g_voice_start[VOICES];

struct Event { uint8_t decor; uint8_t id; uint8_t arg; };
QueueHandle_t g_queue = nullptr;

struct Pending { uint32_t dueMs; pinball::Note note; bool used; };
Pending g_pending[MAX_PENDING];

inline uint32_t now_ms() { return (uint32_t)(esp_timer_get_time() / 1000); }

void schedule(const Event& e) {
    pinball::Pattern p;
    pinball::build_pattern(e.decor, (pinball::Sfx)e.id, e.arg, p);
    const uint32_t t0 = now_ms();
    for (int i = 0; i < p.count; i++) {
        for (int k = 0; k < MAX_PENDING; k++) {
            if (!g_pending[k].used) {
                g_pending[k] = {t0 + p.n[i].atMs, p.n[i], true};
                break;
            }
        }
    }
}

void fire(const pinball::Note& n) {
    // voix libre, sinon la plus ancienne est volee
    int v = -1;
    for (int i = 0; i < SFX_VOICES; i++) if (!g_voice[i].is_playing()) { v = i; break; }
    if (v < 0) {
        v = 0;
        for (int i = 1; i < SFX_VOICES; i++) if ((int32_t)(g_voice_start[i] - g_voice_start[v]) < 0) v = i;
    }
    g_voice_start[v] = now_ms();
    // Volume des effets du runtime AKA (70 = reglage par defaut -> SFX_VOLUME).
    float vol = SFX_VOLUME * ((float)akaRuntime.getSfxVolume() / 70.0f);
    if (vol > 1.0f) vol = 1.0f;
    g_voice[v].play_tone(n.f0, n.f1, n.v0 * vol, n.v1 * vol, n.durMs,
                         (gb_audio_track_tone::tone_type)n.wave);
}

// Musique : l'etat demande par le jeu (ecrit par la boucle principale, lu par AudioTask).
volatile uint8_t g_music_want = 255;
volatile bool g_music_intense = false;

uint8_t g_music_theme = 255;
uint32_t g_music_step = 0;
uint32_t g_music_due = 0;

void music_tick(uint32_t t) {
    const uint8_t want = g_music_want;
    if (want != g_music_theme) {
        g_music_theme = want;
        g_music_step = 0;
        g_music_due = t + 250;   // petit temps d'attente apres le lancement de la bille
        g_voice[MUSIC_VOICE].stop_playing();
    }
    if (g_music_theme == 255 || (int32_t)(t - g_music_due) < 0) return;
    pinball::MusicNote n;
    if (pinball::music_note(g_music_theme, g_music_step, n)) {
        float vol = n.vol * ((float)akaRuntime.getMusicVolume() / 80.0f);   // 80 = reglage par defaut
        if (vol > 1.0f) vol = 1.0f;
        g_voice[MUSIC_VOICE].play_tone(n.freq, n.freq, vol, vol * 0.4f, n.durMs, (gb_audio_track_tone::tone_type)n.wave);
    }
    g_music_step++;
    g_music_due += pinball::music_step_ms(g_music_theme, g_music_intense);
}

void audio_task(void*) {
    while (true) {
        Event e;
        while (xQueueReceive(g_queue, &e, 0) == pdTRUE) schedule(e);

        const uint32_t t = now_ms();
        for (int k = 0; k < MAX_PENDING; k++) {
            if (g_pending[k].used && (int32_t)(t - g_pending[k].dueMs) >= 0) {
                fire(g_pending[k].note);
                g_pending[k].used = false;
            }
        }

        music_tick(t);
        g_player.pool();
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}

} // namespace

void audio_init() {
    gb_ll_audio_set_volume(200);
    for (int i = 0; i < VOICES; i++) {
        g_player.add_track(&g_voice[i]);
        g_voice[i].set_track_volume(1.0f);
    }
    g_queue = xQueueCreate(24, sizeof(Event));
    xTaskCreatePinnedToCore(audio_task, "pinball_audio", 4096, nullptr, 5, nullptr, 1);
}

void audio_music(uint8_t decor, bool intense) {
    g_music_intense = intense;
    g_music_want = (decor < 5) ? decor : 255;
}

void audio_silence() {
    g_music_want = 255;
    for (int i = 0; i < VOICES; i++) g_voice[i].stop_playing();
    for (int k = 0; k < MAX_PENDING; k++) g_pending[k].used = false;
}

void audio_play(uint8_t decor, pinball::Sfx id, uint8_t arg) {
    if (!g_queue) return;
    Event e = {decor, (uint8_t)id, arg};
    xQueueSend(g_queue, &e, 0);   // file pleine : on perd le son, jamais l'image
}

} // namespace platform
