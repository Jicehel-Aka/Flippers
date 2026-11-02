#pragma once
// MOCK pour les tests hôte (PC) : reproduit uniquement la partie de l'API utilisée par main.cpp / aka_hal.h.
#include "Arduino.h"
#include <stdarg.h>
#define VSPI_HOST 2
#define SPI_DMA_CH_AUTO 3
#define TFT_BLACK 0
#define TFT_WHITE 0xFFFF
#define TFT_RED 0xF800
namespace lgfx {

  struct BusCfg{int spi_host,spi_mode,freq_write,freq_read;bool spi_3wire,use_lock;int dma_channel,pin_sclk,pin_mosi,pin_miso,pin_dc;};
  struct PanelCfg{int pin_cs,pin_rst,pin_busy,panel_width,panel_height,offset_x,offset_y,offset_rotation;bool readable,invert,rgb_order,dlen_16bit,bus_shared;};
  struct LightCfg{int pin_bl;bool invert;int freq,pwm_channel;};
  struct Bus_SPI{ BusCfg c{}; BusCfg config(){return c;} void config(const BusCfg&x){c=x;} };
  struct Light_PWM{ LightCfg c{}; LightCfg config(){return c;} void config(const LightCfg&x){c=x;} };
  struct Panel_ILI9341{ PanelCfg c{}; PanelCfg config(){return c;} void config(const PanelCfg&x){c=x;} void setBus(Bus_SPI*){} void setLight(Light_PWM*){} };
  struct LGFX_Device{
    void setPanel(Panel_ILI9341*){} bool init(){return true;} void setRotation(int){} void setBrightness(int){}
    void fillScreen(int){} void setTextColor(int){} void setCursor(int,int){} void print(const char*){}
  };
  extern long g_pushes; extern long g_spriteFail;
  struct LGFX_Sprite{
    LGFX_Sprite(LGFX_Device*){} void setColorDepth(int){}
    void* createSprite(int,int){ return g_spriteFail? nullptr : (void*)this; }
    void fillSprite(int){} void drawFastHLine(int,int,int,int){} void setTextColor(int){} void setTextSize(int){}
    void setCursor(int,int){} void print(const char*){}
    void printf(const char* f,...){ char b[256]; va_list a; va_start(a,f); vsnprintf(b,sizeof b,f,a); va_end(a); }
    void pushSprite(int,int){g_pushes++;} void drawLine(int,int,int,int,int){} void drawCircle(int,int,int,int){}
    void fillCircle(int,int,int,int){} void fillRect(int,int,int,int,int){} void fillRoundRect(int,int,int,int,int,int){}
    void drawRoundRect(int,int,int,int,int,int){} void fillTriangle(int,int,int,int,int,int,int){}
  };
}
using lgfx::LGFX_Sprite;
