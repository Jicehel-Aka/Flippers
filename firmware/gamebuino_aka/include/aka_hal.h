#pragma once

#include <Arduino.h>
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

// ============================================================================
// Brochage matériel Gamebuino AKA (ESP32 + ILI9341 320x240 SPI + Boutons GPIO)
// Surchargeable via build_flags (-DAKA_PIN_...) selon la révision du PCB AKA
//
// ATTENTION : ces valeurs sont INDICATIVES (cible générique `esp32dev`), elles n'ont pas été
// vérifiées sur la vraie console AKA (ESP32-S3, bibliothèque components/gamebuino sous ESP-IDF).
// Voir la section « Firmware : état actuel » du README avant de flasher.
// ============================================================================

#ifndef AKA_PIN_TFT_MOSI
#define AKA_PIN_TFT_MOSI 23
#endif
#ifndef AKA_PIN_TFT_MISO
#define AKA_PIN_TFT_MISO 19
#endif
#ifndef AKA_PIN_TFT_SCLK
#define AKA_PIN_TFT_SCLK 18
#endif
#ifndef AKA_PIN_TFT_CS
#define AKA_PIN_TFT_CS   5
#endif
#ifndef AKA_PIN_TFT_DC
#define AKA_PIN_TFT_DC   2
#endif
#ifndef AKA_PIN_TFT_RST
#define AKA_PIN_TFT_RST  4
#endif
#ifndef AKA_PIN_TFT_BL
#define AKA_PIN_TFT_BL   15
#endif

// Boutons Gamebuino AKA (actifs à l'état bas avec INPUT_PULLUP)
#ifndef AKA_PIN_BTN_A
#define AKA_PIN_BTN_A    32  // Flippers Gauches (console tournée à 90° droite)
#endif
#ifndef AKA_PIN_BTN_D
#define AKA_PIN_BTN_D    33  // Flippers Droits
#endif
#ifndef AKA_PIN_BTN_B
#define AKA_PIN_BTN_B    27  // Secousse (Nudge)
#endif
#ifndef AKA_PIN_BTN_C
#define AKA_PIN_BTN_C    14  // Menu / Changement de table / Pause
#endif
#ifndef AKA_PIN_BTN_R1
#define AKA_PIN_BTN_R1   13  // Ressort du lance-bille (Plunger)
#endif
#ifndef AKA_PIN_BTN_L1
#define AKA_PIN_BTN_L1   12  // Gâchette secondaire (inversion rotation avec C)
#endif
#ifndef AKA_PIN_DPAD_UP
#define AKA_PIN_DPAD_UP  34
#endif
#ifndef AKA_PIN_DPAD_DOWN
#define AKA_PIN_DPAD_DOWN 35
#endif

// Haut-parleur PWM
#ifndef AKA_PIN_SPEAKER
#define AKA_PIN_SPEAKER  25
#endif
#define AKA_PWM_CHANNEL  2

class GamebuinoAKADisplay : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 _panel_instance;
  lgfx::Bus_SPI       _bus_instance;
  lgfx::Light_PWM     _light_instance;

public:
  GamebuinoAKADisplay() {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host    = VSPI_HOST;
      cfg.spi_mode    = 0;
      cfg.freq_write  = 40000000;
      cfg.freq_read   = 16000000;
      cfg.spi_3wire   = false;
      cfg.use_lock    = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;
      cfg.pin_sclk    = AKA_PIN_TFT_SCLK;
      cfg.pin_mosi    = AKA_PIN_TFT_MOSI;
      cfg.pin_miso    = AKA_PIN_TFT_MISO;
      cfg.pin_dc      = AKA_PIN_TFT_DC;
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs           = AKA_PIN_TFT_CS;
      cfg.pin_rst          = AKA_PIN_TFT_RST;
      cfg.pin_busy         = -1;
      cfg.panel_width      = 240;
      cfg.panel_height     = 320;
      cfg.offset_x         = 0;
      cfg.offset_y         = 0;
      cfg.offset_rotation  = 0;
      cfg.readable         = false;
      cfg.invert           = false;
      cfg.rgb_order        = false;
      cfg.dlen_16bit       = false;
      cfg.bus_shared       = true;
      _panel_instance.config(cfg);
    }
    if (AKA_PIN_TFT_BL >= 0) {
      auto cfg = _light_instance.config();
      cfg.pin_bl      = AKA_PIN_TFT_BL;
      cfg.invert      = false;
      cfg.freq        = 12000;
      cfg.pwm_channel = 7;
      _light_instance.config(cfg);
      _panel_instance.setLight(&_light_instance);
    }
    setPanel(&_panel_instance);
  }
};

struct AkaButtonsState {
  bool a = false;
  bool d = false;
  bool b = false;
  bool c = false;
  bool r1 = false;
  bool l1 = false;
  bool up = false;
  bool down = false;

  bool bPressed = false;
  bool cPressed = false;
  bool upPressed = false;
  bool downPressed = false;
};

class AkaHardware {
public:
  GamebuinoAKADisplay lcd;
  AkaButtonsState btn;
  uint8_t portraitRotation = 0; // 0 ou 2 : portrait 240x320 (90° sens horaire depuis paysage)

private:
  bool prevB = false;
  bool prevC = false;
  bool prevUp = false;
  bool prevDown = false;
  uint32_t toneStopMs = 0;

  static void setupInputPin(int pin) {
    if (pin < 0) return;
    if (pin >= 34) {
      pinMode(pin, INPUT);
    } else {
      pinMode(pin, INPUT_PULLUP);
    }
  }

  static bool readLow(int pin) {
    if (pin < 0) return false;
    return digitalRead(pin) == LOW;
  }

public:
  void begin() {
    setupInputPin(AKA_PIN_BTN_A);
    setupInputPin(AKA_PIN_BTN_D);
    setupInputPin(AKA_PIN_BTN_B);
    setupInputPin(AKA_PIN_BTN_C);
    setupInputPin(AKA_PIN_BTN_R1);
    setupInputPin(AKA_PIN_BTN_L1);
    setupInputPin(AKA_PIN_DPAD_UP);
    setupInputPin(AKA_PIN_DPAD_DOWN);

    if (AKA_PIN_SPEAKER >= 0) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
      ledcAttach(AKA_PIN_SPEAKER, 2000, 8);
#else
      ledcSetup(AKA_PWM_CHANNEL, 2000, 8);
      ledcAttachPin(AKA_PIN_SPEAKER, AKA_PWM_CHANNEL);
#endif
      silence();
    }

    lcd.init();
    lcd.setRotation(portraitRotation);
    lcd.setBrightness(240);
    lcd.fillScreen(TFT_BLACK);
  }

  void updateInputs() {
    btn.a    = readLow(AKA_PIN_BTN_A);
    btn.d    = readLow(AKA_PIN_BTN_D);
    btn.b    = readLow(AKA_PIN_BTN_B);
    btn.c    = readLow(AKA_PIN_BTN_C);
    btn.r1   = readLow(AKA_PIN_BTN_R1);
    btn.l1   = readLow(AKA_PIN_BTN_L1);
    btn.up   = readLow(AKA_PIN_DPAD_UP);
    btn.down = readLow(AKA_PIN_DPAD_DOWN);

    btn.bPressed    = btn.b && !prevB;
    btn.cPressed    = btn.c && !prevC;
    btn.upPressed   = btn.up && !prevUp;
    btn.downPressed = btn.down && !prevDown;

    prevB    = btn.b;
    prevC    = btn.c;
    prevUp   = btn.up;
    prevDown = btn.down;

    // L1 + C permet d'inverser l'orientation portrait de 180° selon la nappe écran
    if (btn.l1 && btn.cPressed) {
      portraitRotation = (portraitRotation == 0) ? 2 : 0;
      lcd.setRotation(portraitRotation);
      btn.cPressed = false;
    }

    if (toneStopMs > 0 && millis() >= toneStopMs) {
      silence();
    }
  }

  void playBeep(uint16_t freqHz, uint16_t durationMs) {
    if (AKA_PIN_SPEAKER < 0) return;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(AKA_PIN_SPEAKER, freqHz);
#else
    ledcWriteTone(AKA_PWM_CHANNEL, freqHz);
#endif
    toneStopMs = millis() + durationMs;
  }

  void silence() {
    toneStopMs = 0;
    if (AKA_PIN_SPEAKER < 0) return;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(AKA_PIN_SPEAKER, 0);
#else
    ledcWriteTone(AKA_PWM_CHANNEL, 0);
#endif
  }
};
