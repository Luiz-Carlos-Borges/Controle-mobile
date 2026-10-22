/* Audio cues follow game transitions, never repeated answer broadcasts. */
class GameAudio {
    constructor() {
        this.files = {
            next: 'Próxima seção.mp3', warning: 'Tempo acabando.mp3',
            timeout: 'Tempo esgotado.mp3', ranking: 'Ranking caso alguém mude de posição.mp3',
            podium: 'Pódio final.mp3'
        };
        this.buffers = new Map();
        this.context = null;
        this.source = null;
        this.generation = 0;
        this.scoreTiming = Promise.resolve(null);
        this.resolveTiming = null;
        this.muted = false;
        this.previous = null;
        this.ranking = [];
        this.warned = null;
        this.button = document.querySelector('#sound-toggle');
        this.button.onclick = () => {
            this.muted = !this.muted;
            this.button.textContent = this.muted ? 'Som: desligado' : 'Som: ligado';
            this.button.setAttribute('aria-pressed', String(this.muted));
            this.button.setAttribute('aria-label', this.muted ? 'Ativar áudio do jogo' : 'Silenciar áudio do jogo');
            if (this.muted) this.stop();
        };
        const unlock = () => {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return;
            if (!this.context) this.context = new Context();
            if (this.context.state === 'suspended') this.context.resume().catch(() => {});
            // Cache after the first gesture; browsers require user interaction for sound.
            for (const name of Object.keys(this.files)) this.load(name).catch(() => {});
        };
        document.addEventListener('pointerdown', unlock);
        document.addEventListener('keydown', unlock);
    }
    load(name) {
        if (!this.buffers.has(name)) {
            const pending = fetch('/' + encodeURIComponent(this.files[name]))
                .then(r => { if (!r.ok) throw new Error('Audio unavailable'); return r.arrayBuffer(); })
                .then(bytes => this.context.decodeAudioData(bytes));
            this.buffers.set(name, pending);
            pending.catch(() => this.buffers.delete(name));
        }
        return this.buffers.get(name);
    }
    stop() {
        if (this.resolveTiming) { this.resolveTiming(null); this.resolveTiming = null; }
        this.generation++;
        if (this.source) { this.source.onended = null; this.source.stop(); this.source = null; }
    }
    play(...names) {
        this.stop();
        if (this.mediaActive || this.muted || !this.context || this.context.state !== 'running') return Promise.resolve(null);
        const timing = new Promise(resolve => { this.resolveTiming = resolve; });
        const resolveTiming = value => {
            if (this.resolveTiming === finishTiming) this.resolveTiming = null;
            finishTiming(value);
        };
        const finishTiming = this.resolveTiming;
        const generation = this.generation;
        const next = async () => {
            const name = names.shift();
            if (!name || generation !== this.generation || this.muted) { resolveTiming(null); return; }
            try {
                const buffer = await this.load(name);
                if (generation !== this.generation || this.muted) return;
                const source = this.context.createBufferSource();
                source.buffer = buffer;
                source.connect(this.context.destination);
                this.source = source;
                source.onended = () => { if (this.source === source) this.source = null; next(); };
                source.start();
                if (name === 'ranking') resolveTiming({ duration: 8000, startedAt: this.context.currentTime, context: this.context });
            } catch { if (generation === this.generation) next(); }
        };
        next();
        return timing;
    }
    reset() {
        this.stop(); this.previous = null; this.ranking = []; this.warned = null;
    }
    update(s) {
        if (this.previous && this.previous.pin !== s.pin) this.reset();
        const previous = this.previous;
        const changed = !previous || previous.phase !== s.phase || previous.index !== s.index;
        this.previous = { pin: s.pin, phase: s.phase, index: s.index };
        if (s.phase === 'lobby') {
            this.ranking = s.players.map(p => p.name);
            if (changed) this.stop();
        } else if (changed && s.phase === 'question') {
            this.warned = null;
            if (s.index === 0) this.play('next');
            else this.stop();
        } else if (changed && s.phase === 'results') {
            const order = s.players.map(p => p.name);
            const common = order.filter(name => this.ranking.includes(name));
            const old = this.ranking.filter(name => common.includes(name));
            const moved = common.some((name, i) => old[i] !== name);
            this.ranking = order;
            const cues = [];
            if (s.remaining <= 0) cues.push('timeout');
            // Every score reveal uses the same eight-second ranking cue.
            cues.push('ranking');
            this.scoreTiming = this.play(...cues);
        } else if (changed && s.phase === 'finished') this.play('podium');
        return s.phase === 'results' ? this.scoreTiming : Promise.resolve(null);
    }
    countdown(s, remaining) {
        if (s.phase !== 'question' || remaining <= 0 || remaining > 5) return;
        const key = s.pin + ':' + s.index;
        if (this.warned !== key) { this.warned = key; this.play('warning'); }
    }
}
const gameAudio = new GameAudio();
