import { describe, expect, it } from "vitest";
import { hardwareIniDeClon, iniDeClon, leerIni, paqueteDeImagen, perfilDeTelefono, seCopiaEnClon } from "./copiaDeAvd.js";

describe("leerIni", () => {
  it("lee clave=valor y deja pasar las vacías y las sin «=»", () => {
    const m = leerIni("a=1\n\nbasura\nruta=/x/y=z\r\nb = 2 \n");
    expect([...m]).toEqual([["a", "1"], ["ruta", "/x/y=z"], ["b", "2"]]);
  });
});

describe("paqueteDeImagen", () => {
  it("saca el paquete de avdmanager de image.sysdir.1", () => {
    const c = leerIni("image.sysdir.1=system-images/android-35/google_apis/arm64-v8a/\n");
    expect(paqueteDeImagen(c)).toBe("system-images;android-35;google_apis;arm64-v8a");
  });
  it("sin barra final también", () => {
    expect(paqueteDeImagen(new Map([["image.sysdir.1", "system-images/android-34/default/x86_64"]]))).toBe(
      "system-images;android-34;default;x86_64",
    );
  });
  it.each(["", "otra/cosa/", "system-images/a/b/", "system-images/a/b/c/d/", "system-images/a;b/c/d/"])(
    "con la forma mala %j no adivina",
    (v) => expect(paqueteDeImagen(new Map([["image.sysdir.1", v]]))).toBeUndefined(),
  );
  it("sin la clave, undefined", () => expect(paqueteDeImagen(new Map())).toBeUndefined());
});

describe("perfilDeTelefono", () => {
  it("es hw.device.name", () => expect(perfilDeTelefono(new Map([["hw.device.name", "pixel_8"]]))).toBe("pixel_8"));
  it.each(["", "pixel 8", "a;b", "$(x)"])("rechaza %j", (v) =>
    expect(perfilDeTelefono(new Map([["hw.device.name", v]]))).toBeUndefined());
  it("ausente, undefined", () => expect(perfilDeTelefono(new Map())).toBeUndefined());
});

describe("iniDeClon", () => {
  const base = "avd.ini.encoding=UTF-8\npath=/Users/x/.android/avd/pixel8.avd\npath.rel=avd/pixel8.avd\ntarget=android-35\n";
  it("reescribe path y path.rel y conserva el resto", () => {
    expect(iniDeClon(base, "copia", "/Users/x/.android/avd/copia.avd")).toBe(
      "avd.ini.encoding=UTF-8\npath=/Users/x/.android/avd/copia.avd\npath.rel=avd/copia.avd\ntarget=android-35\n",
    );
  });
  it("si faltaban las claves, las añade", () => {
    expect(iniDeClon("target=android-35\n", "c", "/r/c.avd")).toBe("target=android-35\npath=/r/c.avd\npath.rel=avd/c.avd\n");
  });
});

describe("seCopiaEnClon", () => {
  it.each([
    "multiinstance.lock", "hardware-qemu.ini.lock", "data/misc/x.lock", "hardware-qemu.ini", "emu-launch-params.txt",
    "read-snapshot.txt", "snapshot.trace", "tmpAdbCmds", "bootcompleted.ini", "snapshots/default_boot/x.lock",
  ])("NO copia %s", (r) => expect(seCopiaEnClon(r)).toBe(false));
  it.each([
    "config.ini", "userdata-qemu.img", "userdata-qemu.img.qcow2", "data/misc/adb/x", "cache.img", "AVD.conf",
    "modem_simulator/x", "data/bootcompleted.ini", "data/snapshots/x", "snapshots", "snapshots/default_boot/snapshot.pb", "snapshots/default_boot/hardware.ini", "snapshots\\x",
  ])("copia %s", (r) => expect(seCopiaEnClon(r)).toBe(true));
});

describe("hardwareIniDeClon", () => {
  const texto = [
    "disk.dataPartition.path = /Users/x/.android/avd/../avd/pixel8.avd/userdata-qemu.img",
    "disk.cachePartition.path=/Users/x/.android/avd/pixel8.avd/cache.img",
    "avd.name = pixel8",
    "avd.id = pixel8",
    "otra.ruta = /Users/x/.android/avd/mipixel8.avd/cache.img",
    "hw.ramSize = 2048",
    "avd.name.extra = pixel8",
    "descripcion = pixel8 y pixel8.avdx",
    "",
  ].join("\n");
  it("reescribe la identidad y los segmentos exactos, y nada más", () => {
    expect(hardwareIniDeClon(texto, "pixel8", "copia").split("\n")).toEqual([
      "disk.dataPartition.path = /Users/x/.android/avd/../avd/copia.avd/userdata-qemu.img",
      "disk.cachePartition.path=/Users/x/.android/avd/copia.avd/cache.img",
      "avd.name = copia",
      "avd.id = copia",
      "otra.ruta = /Users/x/.android/avd/mipixel8.avd/cache.img",
      "hw.ramSize = 2048",
      "avd.name.extra = pixel8",
      "descripcion = pixel8 y pixel8.avdx",
      "",
    ]);
  });
  it("conserva los finales de línea CRLF y entiende la barra de Windows", () => {
    expect(hardwareIniDeClon("a = C:\\avd\\pixel8.avd\\x\r\navd.id = pixel8\r\n", "pixel8", "c")).toBe(
      "a = C:\\avd\\c.avd\\x\r\navd.id = c\r\n",
    );
  });
  it("una base con puntos no se toma por expresión regular", () => {
    expect(hardwareIniDeClon("p = /a/p.x.avd/z\nq = /a/pyx.avd/z", "p.x", "n")).toBe("p = /a/n.avd/z\nq = /a/pyx.avd/z");
  });
});
