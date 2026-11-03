idf_component_register(
    SRCS
        app_main.cpp
        game/pinball_core.cpp
        game/sfx_patterns.cpp
        game/music.cpp
        game/inflate.cpp
        ui/gfx_prims.cpp
        ui/render.cpp
        platform/gfx_backend_aka.cpp
        platform/input_aka.cpp
        platform/audio_aka.cpp
        platform/art_aka.cpp
        platform/store_aka.cpp
    INCLUDE_DIRS
        .
    # Decors des plateaux (240 x 520 RGB565 par table, compresses en deflate) : decompresses en PSRAM au choix du plateau.
    EMBED_FILES
        art/art0.z art/art1.z art/art2.z art/art3.z art/art4.z art/art5.z art/art6.z art/art7.z art/art8.z art/art9.z art/art10.z art/art11.z
    # RAPPEL : les composants vont dans REQUIRES, PAS dans INCLUDE_DIRS.
    REQUIRES
        gamebuino aka_runtime
    PRIV_REQUIRES
        esp_timer
        heap
)

# Le rendu et la physique sont du calcul pur : toujours optimises, meme en -Og.
target_compile_options(${COMPONENT_LIB} PRIVATE -O2)
