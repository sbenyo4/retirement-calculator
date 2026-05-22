const PIN_PATTERN = /^\d{4,8}$/;
const PIN_HASH_ITERATIONS = 210_000;
const PIN_HASH_BYTES = 32;
const PIN_SALT_BYTES = 16;

function getCrypto() {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Web Crypto is unavailable');
    }
    return globalThis.crypto;
}

function toBase64(bytes) {
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function fromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derivePinHash(pin, salt, iterations) {
    const cryptoApi = getCrypto();
    const keyMaterial = await cryptoApi.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await cryptoApi.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        PIN_HASH_BYTES * 8
    );
    return new Uint8Array(bits);
}

function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let index = 0; index < left.length; index++) {
        diff |= left[index] ^ right[index];
    }
    return diff === 0;
}

export function isValidPin(pin) {
    return PIN_PATTERN.test(pin || '');
}

export async function createPinLock(pin) {
    if (!isValidPin(pin)) {
        throw new Error('PIN must contain 4 to 8 digits');
    }

    const cryptoApi = getCrypto();
    const salt = cryptoApi.getRandomValues(new Uint8Array(PIN_SALT_BYTES));
    const hash = await derivePinHash(pin, salt, PIN_HASH_ITERATIONS);

    return {
        version: 1,
        algorithm: 'PBKDF2-SHA-256',
        iterations: PIN_HASH_ITERATIONS,
        salt: toBase64(salt),
        hash: toBase64(hash)
    };
}

export async function verifyPinLock(pin, pinLock) {
    if (!isValidPin(pin) || !pinLock?.salt || !pinLock?.hash) return false;

    const salt = fromBase64(pinLock.salt);
    const expectedHash = fromBase64(pinLock.hash);
    const iterations = Number(pinLock.iterations) || PIN_HASH_ITERATIONS;
    const actualHash = await derivePinHash(pin, salt, iterations);

    return equalBytes(actualHash, expectedHash);
}
