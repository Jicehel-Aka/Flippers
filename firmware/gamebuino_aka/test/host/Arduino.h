#pragma once
// MOCK pour les tests hôte (PC) : reproduit uniquement la partie de l'API utilisée par main.cpp / aka_hal.h.
#include <stdint.h>
#include <stdio.h>
#include <math.h>
#include <string.h>
#include <algorithm>
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define INPUT 0
#define INPUT_PULLUP 1
#define LOW 0
#define HIGH 1
#define constrain(amt,low,high) ((amt)<(low)?(low):((amt)>(high)?(high):(amt)))
using std::min; using std::max;
extern uint32_t g_micros;
inline uint32_t micros(){return g_micros;}
inline uint32_t millis(){return g_micros/1000;}
inline void delay(uint32_t){}
extern int g_pins[64];
inline void pinMode(int,int){}
inline int digitalRead(int p){return g_pins[p]?LOW:HIGH;} // 1 = bouton enfoncé (actif bas)
inline void ledcSetup(int,int,int){}
inline void ledcAttachPin(int,int){}
inline void ledcWriteTone(int,int){}
struct SerialMock{ void begin(int){} void println(const char*s){printf("[Serial] %s\n",s);} };
extern SerialMock Serial;
