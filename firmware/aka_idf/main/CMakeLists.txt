idf_component_register(
    SRCS
        app_main.cpp
        game/pinball_core.cpp
        game/sfx_patterns.cpp
        game/music.cpp
        ui/gfx_prims.cpp
        ui/render.cpp
        platform/gfx_backend_aka.cpp
        platform/input_aka.cpp
        platform/audio_aka.cpp
        platform/art_aka.cpp
        platform/store_aka.cpp
    INCLUDE_DIRS
        .
    # Decors des plateaux (240 x 520 RGB565 par table) : lus en flash, sans copie en RAM.
    EMBED_FILES
        art/art0.bin art/art1.bin art/art2.bin art/art3.bin
    # RAPPEL : les composants vont dans REQUIRES, PAS dans INCLUDE_DIRS.
    REQUIRES
        gamebuino aka_runtime
    PRIV_REQUIRES
        esp_timer
)

# Le rendu et la physique sont du calcul pur : toujours optimises, meme en -Og.
target_compile_options(${COMPONENT_LIB} PRIVATE -O2)
