
/**
 * Calculates the visual layout for timeline events to prevent overlaps (Swimlanes).
 * 
 * @param {Array} events - List of event objects.
 * @param {Object} options - Configuration options.
 * @param {number} options.minSpacingYears - Minimum buffer between events on the same track (default 0.5).
 * @returns {Object} result
 * @returns {Array} result.layoutEvents - Events with 'trackIndex' and 'lane' ('income' or 'expense').
 * @returns {number} result.incomeTracks - Total tracks used for income.
 * @returns {number} result.expenseTracks - Total tracks used for expenses.
 */
export const calculateTimelineLayout = (events, { minSpacingYears = 0.5 } = {}) => {
    // 1. Separate by lane preferences
    const incomeEvents = [];
    const expenseEvents = [];

    events.forEach(event => {
        // Determine if it's income or expense based on type or properties
        // Assuming the caller might pre-process, but we can check standard types here if needed.
        // For flexibility, we'll check a 'isExpense' flag or generic logic.

        // Based on existing component logic:
        // isExpense = ONE_TIME_EXPENSE or EXPENSE_CHANGE
        const isExpense = event.isExpense || event.type?.includes('EXPENSE');

        if (isExpense) {
            expenseEvents.push(event);
        } else {
            incomeEvents.push(event);
        }
    });

    // 2. Sort function: by start date, then by duration (longer first to take inner tracks) 
    const byStart = (a, b) => {
        const startDiff = getEventStart(a) - getEventStart(b);
        // If start dates are close (within ~1 month), prioritize longer events (Backbones) first
        if (Math.abs(startDiff) < 0.1) {
            const durA = getEventEnd(a) - getEventStart(a);
            const durB = getEventEnd(b) - getEventStart(b);
            const durDiff = durB - durA;
            if (Math.abs(durDiff) > 0.01) return durDiff;
            // Deterministic tie-breaker: ID or Name
            return (a.id || '').localeCompare(b.id || '');
        }
        return startDiff;
    };

    incomeEvents.sort(byStart);
    expenseEvents.sort(byStart);

    // 3. Assign Tracks
    const incomeTracks = assignTracks(incomeEvents, minSpacingYears);
    const expenseTracks = assignTracks(expenseEvents, minSpacingYears);

    return {
        layoutEvents: [...incomeEvents.map(e => ({ ...e, lane: 'income' })), ...expenseEvents.map(e => ({ ...e, lane: 'expense' }))],
        incomeTracks,
        expenseTracks
    };
};

function getEventStart(event) {
    return event.startDate.year + (event.startDate.month / 12);
}

function getEventEnd(event) {
    if (event.endDate) {
        return event.endDate.year + (event.endDate.month / 12);
    }
    // For one-time events, define a "visual duration" for collision purposes
    // Use the same start date + a small width (e.g. 0.1) or rely on minSpacingYears
    return getEventStart(event);
}

function assignTracks(items, padding) {
    const tracks = []; // Array of end times for each track: [track0_endTime, track1_endTime, ...]

    items.forEach(item => {
        const start = getEventStart(item);
        const end = getEventEnd(item);

        // Find best track: First track where track_end + padding <= item_start
        let placed = false;

        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i] + padding <= start) {
                // Determine overlaps? 
                // Wait, if recurrence events are long bars, we just need to ensure time ranges don't overlap.
                // But simplified "packing" usually just tracks the latest end time if sorted by start.
                // HOWEVER, if a short event ends, and a later event starts, we can reuse the track.
                // Ideally we want to fill gaps.

                // Optimized check: actually we need to store ALL occupied ranges for a track if we want to fill gaps?
                // Simplest version: "Greedy" packing. Since we sort by start, we only need to know when the track becomes free.

                item.trackIndex = i + 1; // 1-based index for UI
                tracks[i] = Math.max(tracks[i], end); // Extend track usage
                placed = true;
                break;
            }
        }

        if (!placed) {
            // New track
            item.trackIndex = tracks.length + 1;
            tracks.push(end);
        }
    });

    return tracks.length;
}
