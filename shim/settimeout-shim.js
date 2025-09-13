// Preload shim to wrap global.setTimeout and catch negative durations early
const _originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => {
    try {
        if (typeof delay === 'number' && delay < 0) {
            console.warn(`⚠️ Preload shim detected negative setTimeout delay: ${delay}. Clamping to 1ms.`);
            console.warn(new Error('Negative setTimeout stack (preload shim)').stack);
            delay = 1;
        }
    } catch (e) {}
    return _originalSetTimeout(fn, delay, ...args);
};

// also wrap setInterval defensively
const _originalSetInterval = global.setInterval;
global.setInterval = (fn, delay, ...args) => {
    try {
        if (typeof delay === 'number' && delay < 0) {
            console.warn(`⚠️ Preload shim detected negative setInterval delay: ${delay}. Clamping to 1ms.`);
            console.warn(new Error('Negative setInterval stack (preload shim)').stack);
            delay = 1;
        }
    } catch (e) {}
    return _originalSetInterval(fn, delay, ...args);
};

module.exports = {};
