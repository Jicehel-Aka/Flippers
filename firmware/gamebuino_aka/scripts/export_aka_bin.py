Import("env")
import os
import shutil


def export_aka_binaries(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    proj_dir = env.subst("$PROJECT_DIR")
    dist_dir = os.path.join(proj_dir, "dist")
    os.makedirs(dist_dir, exist_ok=True)

    fw_bin = os.path.join(build_dir, "firmware.bin")
    fw_elf = os.path.join(build_dir, "firmware.elf")

    if os.path.exists(fw_bin):
        sd_bin = os.path.join(dist_dir, "PINBALL.BIN")
        app_bin = os.path.join(dist_dir, "gamebuino-aka-pinball-app-0x10000.bin")
        shutil.copyfile(fw_bin, sd_bin)
        shutil.copyfile(fw_bin, app_bin)
        print(f"[AKA Export] Binaire MicroSD généré : {sd_bin}")

    if os.path.exists(fw_elf):
        shutil.copyfile(fw_elf, os.path.join(dist_dir, "gamebuino-aka-pinball.elf"))

    platform = env.PioPlatform()
    framework_dir = platform.get_package_dir("framework-arduinoespressif32") or ""
    esptool_dir = platform.get_package_dir("tool-esptoolpy") or ""

    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    boot_app0 = os.path.join(framework_dir, "tools", "partitions", "boot_app0.bin")
    esptool_py = os.path.join(esptool_dir, "esptool.py")
    merged_bin = os.path.join(dist_dir, "gamebuino-aka-pinball-full-flash-0x0.bin")

    if all(os.path.exists(p) for p in [bootloader, partitions, boot_app0, fw_bin, esptool_py]):
        cmd = (
            f'"{env.subst("$PYTHONEXE")}" "{esptool_py}" --chip esp32 merge_bin '
            f'-o "{merged_bin}" --flash_mode dio --flash_freq 40m --flash_size 4MB '
            f'0x1000 "{bootloader}" '
            f'0x8000 "{partitions}" '
            f'0xe000 "{boot_app0}" '
            f'0x10000 "{fw_bin}"'
        )
        res = env.Execute(cmd)
        if res == 0:
            print(f"[AKA Export] Image flash USB complète générée : {merged_bin}")


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", export_aka_binaries)
