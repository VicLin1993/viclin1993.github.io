// 前端加解密工具
async function decryptNacosCfg(password, saltB64, iter, encB64) {
    try {
        const enc = Uint8Array.from(atob(encB64), c => c.charCodeAt(0));
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const iv = enc.slice(0, 12);
        const ct = enc.slice(12);

        const pwKey = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
            pwKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
        return null;
    }
}
