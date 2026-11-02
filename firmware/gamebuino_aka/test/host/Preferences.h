#pragma once
// MOCK pour les tests hôte (PC) : reproduit uniquement la partie de l'API utilisée par main.cpp / aka_hal.h.
#include <stdint.h>
struct Preferences{ bool begin(const char*,bool=false){return true;} uint32_t getUInt(const char*,uint32_t d){return d;} void putUInt(const char*,uint32_t){} void end(){} };
