import { describe, expect, it } from 'vitest';
import { selectLastProfileInputData } from './useRetirementData';

describe('selectLastProfileInputData', () => {
    it('prefers legacy profile data so startup opens cleanly without unsaved changes', () => {
        const profileData = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: {}
        };
        const sessionInputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: { 2030: 26000 }
        };

        const selected = selectLastProfileInputData(
            {
                id: 'profile-1',
                data: profileData,
                updatedAt: 2000
            },
            {
                profileId: 'profile-1',
                inputs: sessionInputs,
                updatedAt: 1000
            }
        );

        expect(selected).toBe(profileData);
    });

    it('uses dataUpdatedAt when available so newer profile data can win', () => {
        const profileData = {
            monthlyNetIncomeDesired: 22000,
            yearlyIncomeOverrides: { 2031: 28000 }
        };
        const sessionInputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: { 2030: 26000 }
        };

        const selected = selectLastProfileInputData(
            {
                id: 'profile-1',
                data: profileData,
                updatedAt: 3000,
                dataUpdatedAt: 2500
            },
            {
                profileId: 'profile-1',
                inputs: sessionInputs,
                updatedAt: 2000
            }
        );

        expect(selected).toBe(profileData);
    });

    it('does not let a newer matching session override the startup profile', () => {
        const profileData = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: {}
        };
        const sessionInputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: { 2030: 26000 }
        };

        const selected = selectLastProfileInputData(
            {
                id: 'profile-1',
                data: profileData,
                updatedAt: 4000,
                dataUpdatedAt: 1000
            },
            {
                profileId: 'profile-1',
                inputs: sessionInputs,
                updatedAt: 3000
            }
        );

        expect(selected).toBe(profileData);
    });

    it('does not let an unscoped draft session override the startup profile', () => {
        const profileData = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: {}
        };
        const sessionInputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: { 2030: 26000 }
        };

        const selected = selectLastProfileInputData(
            {
                id: 'profile-1',
                data: profileData,
                updatedAt: 1000,
                dataUpdatedAt: 1000
            },
            {
                inputs: sessionInputs,
                updatedAt: 3000
            }
        );

        expect(selected).toBe(profileData);
    });

    it('ignores sessions that belong to a different profile', () => {
        const profileData = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: {}
        };
        const sessionInputs = {
            monthlyNetIncomeDesired: 20000,
            yearlyIncomeOverrides: { 2030: 26000 }
        };

        const selected = selectLastProfileInputData(
            {
                id: 'profile-1',
                data: profileData,
                updatedAt: 1000,
                dataUpdatedAt: 1000
            },
            {
                profileId: 'profile-2',
                inputs: sessionInputs,
                updatedAt: 3000
            }
        );

        expect(selected).toBe(profileData);
    });
});
