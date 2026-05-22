import { describe, expect, it } from 'vitest';
import { createPinLock, isValidPin, verifyPinLock } from './pinLock';

describe('PIN lock', () => {
    it('accepts only 4 to 8 digit PINs', () => {
        expect(isValidPin('1234')).toBe(true);
        expect(isValidPin('12345678')).toBe(true);
        expect(isValidPin('123')).toBe(false);
        expect(isValidPin('123456789')).toBe(false);
        expect(isValidPin('12a4')).toBe(false);
    });

    it('stores a salted verifier and validates the correct PIN', async () => {
        const lock = await createPinLock('4826');

        expect(lock.hash).not.toContain('4826');
        expect(lock.salt).toBeTruthy();
        await expect(verifyPinLock('4826', lock)).resolves.toBe(true);
        await expect(verifyPinLock('4827', lock)).resolves.toBe(false);
    });
});
