export function aBase64url(bytes) {
    let binario = "";
    for (const b of bytes)
        binario += String.fromCharCode(b);
    return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function deBase64url(texto) {
    if (!/^[A-Za-z0-9_-]*$/.test(texto))
        return undefined;
    const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
    const relleno = normal + "=".repeat((4 - (normal.length % 4)) % 4);
    try {
        const binario = atob(relleno);
        return Uint8Array.from(binario, (c) => c.charCodeAt(0));
    }
    catch {
        return undefined;
    }
}
