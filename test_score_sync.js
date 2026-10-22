// Regression: three consecutive rounds, repeated broadcasts and early advance.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
let frame;
const button = { disabled: false };
const sounds = [];
const clock = { currentTime: 0 };
const context = vm.createContext({
    console, Map, Promise, state: null, deadline: 0,
    esc: v => v, elements: [],
    performance: { now: () => clock.currentTime * 1000 },
    window: { matchMedia: () => ({ matches: false }) },
    document: { addEventListener() {}, querySelector: selector => selector === '#sound-toggle' ? { setAttribute() {} } : button },
    app: { querySelectorAll: () => context.elements },
    requestAnimationFrame: fn => { frame = fn; return 1; },
    cancelAnimationFrame: () => { frame = null; },
});
vm.runInContext(fs.readFileSync('audio.js', 'utf8') + '\nglobalThis.audio = gameAudio;', context);
context.audio.context = Object.assign(clock, {
    state: 'running', destination: {},
    createBufferSource: () => ({ connect() {}, stop() {}, start() { sounds.push(clock.currentTime); } }),
});
context.audio.load = async () => ({ duration: 8 });
const source = fs.readFileSync('app.js', 'utf8');
vm.runInContext(source.slice(source.indexOf('const displayedScores'), source.indexOf('function renderGame')), context);
vm.runInContext(`function renderGame(s) {
    state = s;
    globalThis.elements = s.phase === 'results' ? s.players.map(p => ({
        dataset: { scoreName: p.name, scoreTarget: String(p.score) },
        textContent: String(displayedScores.get(p.name) ?? 0), classList: { toggle() {} }
    })) : [];
}`, context);
const flush = () => new Promise(setImmediate);
const snapshot = (phase, index, score) => ({ pin: '123456', role: 'host', phase, index, remaining: 10, players: [{ name: 'Ana', score }] });
function render(s) { context.snapshot = s; vm.runInContext('render(snapshot)', context); }
function tick(seconds) { clock.currentTime = seconds; if (frame) frame(seconds * 1000); }
function score() { return Number(context.elements[0].textContent.replace(/\D/g, '')); }
(async () => {
    render(snapshot('lobby', -1, 0));
    for (let i = 0; i < 3; i++) {
        const base = i * 10;
        clock.currentTime = base;
        render(snapshot('question', i, i * 1000));
        await flush();
        const before = sounds.length;
        render(snapshot('results', i, (i + 1) * 1000));
        await flush();
        assert.equal(sounds.length, before + 1, 'Ranking audio must play even with one player');
        assert.equal(score(), i * 1000, 'Must start at accumulated points');
        assert(button.disabled, 'Cannot interrupt ranking by advancing');
        tick(base + 4);
        assert.equal(score(), i * 1000 + 500);
        render(snapshot('results', i, (i + 1) * 1000));
        await flush();
        assert.equal(score(), i * 1000 + 500, 'Repeated broadcast must not reset or accelerate');
        assert.equal(sounds.length, before + 1, 'Repeated broadcast must not restart audio');
        tick(base + 8);
        assert.equal(score(), (i + 1) * 1000);
        assert(!button.disabled);
    }
    // A forced phase change still commits the actual score, not an unfinished counter.
    clock.currentTime = 30;
    render(snapshot('question', 3, 3000)); await flush();
    render(snapshot('results', 3, 4000)); await flush();
    tick(32); assert.equal(score(), 3250);
    render(snapshot('question', 4, 4000)); await flush();
    render(snapshot('results', 4, 5000)); await flush();
    assert.equal(score(), 4000);
    console.log('OK: consecutive rounds, cumulative points, 8-second audio sync, duplicate updates and early advance');
})().catch(error => { console.error(error); process.exitCode = 1; });
