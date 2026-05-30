import { describe, expect, it } from 'vitest';
import { calculateRetirementWithAI, parseAiJsonObject, salvageAiRetirementResult } from './ai-calculator';

describe('parseAiJsonObject', () => {
    it('extracts JSON from markdown-wrapped AI responses', () => {
        const parsed = parseAiJsonObject(`
            Here is the result:
            \`\`\`json
            { "balanceAtRetirement": 1000, "ranOutAtAge": null }
            \`\`\`
        `);

        expect(parsed).toEqual({
            balanceAtRetirement: 1000,
            ranOutAtAge: null,
        });
    });

    it('repairs missing commas between object properties', () => {
        const parsed = parseAiJsonObject(`{
            "balanceAtRetirement": 5364227
            "balanceAtEnd": 1512152
            "ranOutAtAge": null
            "surplus": true
        }`);

        expect(parsed).toMatchObject({
            balanceAtRetirement: 5364227,
            balanceAtEnd: 1512152,
            ranOutAtAge: null,
            surplus: true,
        });
    });

    it('repairs trailing commas before object and array endings', () => {
        const parsed = parseAiJsonObject(`{
            "taxBrackets": [
                { "rate": 10, },
            ],
        }`);

        expect(parsed).toEqual({
            taxBrackets: [{ rate: 10 }],
        });
    });

    it('repairs missing commas between array object elements', () => {
        const parsed = parseAiJsonObject(`{
            "history": [
                { "age": 53, "balance": 1000 }
                { "age": 54, "balance": 900 }
            ]
        }`);

        expect(parsed).toEqual({
            history: [
                { age: 53, balance: 1000 },
                { age: 54, balance: 900 },
            ],
        });
    });

    it('repairs missing commas between primitive array elements', () => {
        const parsed = parseAiJsonObject(`{
            "messages": ["first" "second" "third"],
            "scores": [1 2 3],
            "flags": [true false null]
        }`);

        expect(parsed).toEqual({
            messages: ['first', 'second', 'third'],
            scores: [1, 2, 3],
            flags: [true, false, null],
        });
    });

    it('repairs missing commas after arrays and nested objects', () => {
        const parsed = parseAiJsonObject(`{
            "history": [1, 2]
            "metadata": { "ok": true }
            "summary": "done"
        }`);

        expect(parsed).toEqual({
            history: [1, 2],
            metadata: { ok: true },
            summary: 'done',
        });
    });
});

describe('salvageAiRetirementResult', () => {
    it('extracts the retirement fields even when an unrelated object property is malformed', () => {
        const parsed = salvageAiRetirementResult(`{
            "balanceAtRetirement": 5364227,
            "balanceAtEnd": 1512152,
            "ranOutAtAge": null,
            "requiredCapitalAtRetirement": 4470000,
            "requiredCapitalForPerpetuity": 7170444,
            "surplus": 894227,
            "pvOfDeficit": 0,
            "pvOfCapitalPreservation": 1800000,
            "initialGrossWithdrawal": 18000,
            "notes": { "bad": "value" "missingComma": true }
        }`);

        expect(parsed).toMatchObject({
            balanceAtRetirement: 5364227,
            balanceAtEnd: 1512152,
            ranOutAtAge: null,
            requiredCapitalAtRetirement: 4470000,
            requiredCapitalForPerpetuity: 7170444,
            surplus: 894227,
            pvOfDeficit: 0,
            pvOfCapitalPreservation: 1800000,
            initialGrossWithdrawal: 18000,
        });
    });
});

describe('calculateRetirementWithAI malformed response fallback', () => {
    it('returns the mathematical baseline when AI JSON cannot be parsed or salvaged', async () => {
        const baseline = {
            balanceAtRetirement: 123456,
            balanceAtEnd: 7890,
            requiredCapitalAtRetirement: 100000,
            source: 'math',
        };

        const result = await calculateRetirementWithAI(
            { prompt: 'return bad json' },
            'unsupported-test-provider',
            'test-model',
            'fake-key',
            baseline,
        );

        expect(result).toMatchObject({
            ...baseline,
            source: 'math-fallback',
            aiFallbackReason: 'malformed-json',
        });
    });
});
