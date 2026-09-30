import { describe, expect, it } from "vitest";
import { iniDeClon, leerIni, paqueteDeImagen, perfilDeTelefono, seCopiaEnClon } from "./copiaDeAvd.js";

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
    "read-snapshot.txt", "snapshot.trace", "tmpAdbCmds", "bootcompleted.ini", "snapshots", "snapshots/default_boot/snapshot.pb",
    "snapshots\\x",
  ])("NO copia %s", (r) => expect(seCopiaEnClon(r)).toBe(false));
  it.each([
    "config.ini", "userdata-qemu.img", "userdata-qemu.img.qcow2", "data/misc/adb/x", "cache.img", "AVD.conf",
    "modem_simulator/x", "data/bootcompleted.ini", "data/snapshots/x",
  ])("copia %s", (r) => expect(seCopiaEnClon(r)).toBe(true));
});
