// In production, suppress log/info/warn/debug but keep error visible.
const isProd = import.meta.env.PROD;
const noop = () => {};

export const logger = {
    log:   isProd ? noop : console.log.bind(console),
    info:  isProd ? noop : console.info.bind(console),
    warn:  isProd ? noop : console.warn.bind(console),
    debug: isProd ? noop : console.debug.bind(console),
    error: console.error.bind(console),
};
