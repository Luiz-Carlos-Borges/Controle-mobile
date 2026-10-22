const app = document.querySelector('#app');
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const symbols = ['▲', '◆', '●', '■'];
let socket, state, deadline = 0, draft = [], connected = false;
let playerAvatar = '', avatarLoading = false;
function avatarHTML(player, extraClass = '') {
    return player.avatar ? `<img class="avatar ${extraClass}" src="${esc(player.avatar)}" alt="Foto de ${esc(player.name)}">` : `<span class="avatar avatar-initial ${extraClass}" aria-hidden="true">${esc((player.name || '?').slice(0, 1).toUpperCase())}</span>`;
}
function avatarPicker(photo) {
    return `<div class="avatar-picker"><div id="avatar-preview">${avatarHTML({ name: 'Você', avatar: photo })}</div><div><label for="player-photo">Sua foto (opcional)</label><input id="player-photo" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" class="back" id="remove-avatar">Remover foto</button></div><p id="avatar-status" role="status"></p></div>`;
}
function bindAvatarPicker(inLobby = false) {
    const input = document.querySelector('#player-photo');
    document.querySelector('#remove-avatar').onclick = () => {
        if (avatarLoading) return;
        playerAvatar = '';
        if (inLobby) send({ action: 'set_avatar', avatar: '' });
        else { document.querySelector('#avatar-preview').innerHTML = avatarHTML({ name: 'Você' }); input.value = ''; }
    };
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) return notice('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');
        avatarLoading = true; input.disabled = true;
        const status = document.querySelector('#avatar-status'); status.textContent = 'Preparando foto…';
        const url = URL.createObjectURL(file);
        try {
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 128);
            const size = Math.min(image.naturalWidth, image.naturalHeight);
            ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 128, 128);
            const avatar = canvas.toDataURL('image/jpeg', 0.8);
            if (avatar.length > 40000) throw new Error('Escolha uma foto menor.');
            if (!input.isConnected) return;
            playerAvatar = avatar;
            if (inLobby) { if (state?.phase === 'lobby') send({ action: 'set_avatar', avatar }); }
            else document.querySelector('#avatar-preview').innerHTML = avatarHTML({ name: 'Você', avatar });
            status.textContent = 'Foto pronta!';
        } catch (error) { notice(error.message || 'Não foi possível abrir a foto.'); status.textContent = ''; }
        finally { URL.revokeObjectURL(url); avatarLoading = false; input.disabled = false; }
    };
}
function podium(players) {
    const count = Math.min(3, players.length);
    return `<div class="podium" aria-label="Pódio final">${players.slice(0, 3).map((p, index) => {
        const place = index + 1;
        const delay = (count - place) * 2 + 0.5;
        return `<div class="podium-place place-${place}" style="--reveal-delay:${delay}s"><div class="podium-person">${place === 1 ? '<span class="podium-crown" aria-hidden="true">♛</span>' : ''}${avatarHTML(p)}<h3>${esc(p.name)}</h3><p>${p.score.toLocaleString('pt-BR')} pontos</p></div><div class="podium-pillar"><span>${place}</span></div></div>`;
    }).join('')}</div>`;
}
let account = null, quizId = null, quizTitle = '', quizDuration = 20, saving = false;
function accountScreen(register = false) {
    app.innerHTML = `<section class="editor"><button class="back" id="back">← Voltar</button><div class="card"><div class="icon">◎</div><h2>${register ? 'Crie sua conta' : 'Entre na sua conta'}</h2><p>Salve seus quizzes e continue a edição mais tarde, em qualquer dispositivo da rede.</p><form id="account-form"><label for="username">Nome de usuário</label><input id="username" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_.-]{3,24}" autocomplete="username" required><label for="account-password">Sua senha</label><input id="account-password" type="password" minlength="6" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" required>${register ? '<label for="confirm-password">Confirme sua senha</label><input id="confirm-password" type="password" minlength="6" maxlength="128" autocomplete="new-password" required>' : ''}<button class="wide">${register ? 'Criar conta' : 'Entrar'}</button></form><button class="host-link" id="switch-account">${register ? 'Já tenho uma conta' : 'Quero criar uma conta'}</button></div></section>`;
    document.querySelector('#back').onclick = home;
    document.querySelector('#switch-account').onclick = () => accountScreen(!register);
    document.querySelector('#account-form').onsubmit = e => {
        e.preventDefault();
        const password = document.querySelector('#account-password').value;
        if (register && document.querySelector('#confirm-password').value !== password) return notice('As senhas não são iguais.');
        send({ action: register ? 'register' : 'login', username: document.querySelector('#username').value, password });
    };
}
function openLibrary() { send({ action: 'list_quizzes' }); }
function library(quizzes) {
    app.innerHTML = `<section class="editor"><button class="back" id="back">← Início</button><div class="eyebrow">Sua conta · ${esc(account.username)}</div><h2>Meus quizzes</h2><p>Abra um quiz para editar ou apresentar.</p><div class="actions"><button id="new-quiz">+ Novo quiz</button><button class="secondary" id="logout">Sair da conta</button></div><div class="quiz-library">${quizzes.length ? quizzes.map(q => `<article class="card quiz-item"><h3>${esc(q.title)}</h3><p>${q.count} perguntas · ${q.duration} segundos por pergunta</p><button class="secondary" data-edit="${q.id}">Abrir e editar →</button></article>`).join('') : '<div class="card"><h3>Seu primeiro quiz começa aqui</h3><p>Clique em Novo quiz, crie suas perguntas e salve na sua conta.</p></div>'}</div></section>`;
    document.querySelector('#back').onclick = home;
    document.querySelector('#logout').onclick = () => send({ action: 'logout' });
    document.querySelector('#new-quiz').onclick = () => { draft = []; quizId = null; quizTitle = ''; quizDuration = 20; editor(); };
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => send({ action: 'get_quiz', id: Number(b.dataset.edit) }));
}
function preserveEditor() {
    collect(); quizTitle = document.querySelector('#quiz-title').value; quizDuration = Number(document.querySelector('#duration').value);
}
function notice(message) { const el = document.querySelector('#notice'); el.textContent = message; el.style.display = 'block'; clearTimeout(notice.timer); notice.timer = setTimeout(() => el.style.display = 'none', 5000); }
function send(data) { if (!connected) return notice('Sem conexão. Inicie server.py e recarregue.'); socket.send(JSON.stringify(data)); }
function home() {
    gameAudio.reset();
    app.innerHTML = `<div class="hero"><section class="intro"><div class="eyebrow">O conhecimento vira diversão</div><h1>Uma pergunta.<br>Todo mundo.<br><em>Valendo pontos.</em></h1><p>Reúna a turma, desafie seus amigos e descubra quem é mais rápido na resposta.</p></section><section class="card"><div class="icon">↗</div><h2>Pronto para jogar?</h2><p>Peça o PIN ao apresentador e entre na partida.</p><form id="join"><label for="pin">PIN do jogo</label><input class="pin-input" id="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required><label for="name">Seu apelido</label><input id="name" minlength="2" maxlength="24" autocomplete="nickname" aria-describedby="nickname-help" placeholder="Escolha seu apelido" required><button class="wide">Entrar no jogo →</button></form><button class="host-link" id="host">Quero apresentar um quiz</button></section></div>`;
    document.querySelector('#join button').insertAdjacentHTML('beforebegin', avatarPicker(playerAvatar));
    bindAvatarPicker();
    document.querySelector('#join').onsubmit = e => { e.preventDefault(); if (avatarLoading) return notice('Aguarde a foto ficar pronta.'); send({ action: 'join', pin: document.querySelector('#pin').value, name: document.querySelector('#name').value.trim(), avatar: playerAvatar }); };
    document.querySelector('#host').onclick = editor;
    document.querySelector('#host').insertAdjacentHTML('afterend', `<button class="host-link" id="account-link">${account ? 'Meus quizzes · ' + esc(account.username) : 'Minha conta · Salvar meus quizzes'}</button>`);
    document.querySelector('#account-link').onclick = () => account ? openLibrary() : accountScreen();
}
function collect() { draft = [...document.querySelectorAll('.question-edit')].map(el => ({ text: el.querySelector('textarea').value, options: [...el.querySelectorAll('.options-edit input')].map(i => i.value), correct: Number(el.querySelector('select').value), image: el.dataset.image || '' })); }
function editor() {
    app.innerHTML = `<section class="editor"><button class="back" id="back">← Voltar</button><div class="eyebrow">Você no comando</div><h2>Prepare seu quiz</h2><p>Use as cinco perguntas prontas ou crie seu próprio desafio.</p><div class="card"><label for="duration">Tempo por pergunta</label><select id="duration"><option value="10">10 segundos</option><option value="20" selected>20 segundos</option><option value="30">30 segundos</option><option value="60">60 segundos</option></select><div id="questions"></div><div class="actions"><button class="secondary" id="add">+ Adicionar pergunta</button><button id="create">Criar sala →</button></div></div></section>`;
    document.querySelector('#back').onclick = () => { preserveEditor(); account ? openLibrary() : home(); };
    document.querySelector('#duration').insertAdjacentHTML('beforebegin', `<label for="quiz-title">Título do quiz</label><input id="quiz-title" maxlength="80" placeholder="Ex.: Desafio de conhecimentos gerais" value="${esc(quizTitle)}">`);
    document.querySelector('#duration').value = String(quizDuration);
    document.querySelector('#create').insertAdjacentHTML('beforebegin', `<button class="secondary" id="save-quiz">${account ? 'Salvar na minha conta' : 'Entrar para salvar'}</button>`);
    document.querySelector('#save-quiz').onclick = () => {
        preserveEditor();
        if (!account) return accountScreen();
        if (saving) return;
        if (!quizTitle.trim()) return notice('Dê um título ao seu quiz.');
        if (!draft.length) return notice('Adicione pelo menos uma pergunta para salvar seu quiz.');
        if (!connected) return notice('Sem conexão com o servidor.');
        saving = true; document.querySelector('#save-quiz').disabled = true;
        send({ action: 'save_quiz', id: quizId, title: quizTitle, duration: quizDuration, questions: draft });
    };
    document.querySelector('#add').onclick = () => { collect(); if (draft.length >= 30) return notice('Limite de 30 perguntas.'); draft.push({ text: '', options: ['', '', '', ''], correct: 0 }); draw(); };
    document.querySelector('#create').onclick = () => {
        preserveEditor();
        createRoom();
    }; draw();
}
function createRoom() { const data = { action: 'create', duration: quizDuration }; if (draft.length) data.questions = draft; send(data); }
function draw() { document.querySelector('#questions').innerHTML = draft.map((q, i) => `<div class="question-edit" data-image="${esc(q.image || '')}"><label>Pergunta ${i + 1}</label><textarea maxlength="300" placeholder="Escreva sua pergunta" aria-label="Pergunta ${i + 1}">${esc(q.text)}</textarea><div class="image-editor"><label for="question-image-${i}">Imagem da pergunta (opcional)</label><input id="question-image-${i}" class="image-upload" data-index="${i}" type="file" accept="image/jpeg,image/png,image/webp"><p class="image-hint">JPG, PNG ou WebP, at? 10 MB. A imagem aparece abaixo do enunciado.</p>${q.image ? `<img class="image-preview" src="${esc(q.image)}" alt="Pr?via da imagem da pergunta ${i + 1}"><button class="back remove-image" data-index="${i}">Remover imagem</button>` : ''}</div><div class="options-edit">${q.options.map((o, j) => `<input maxlength="100" aria-label="Alternativa ${j + 1}" placeholder="${symbols[j]} Alternativa ${j + 1}" value="${esc(o)}">`).join('')}</div><label>Resposta correta</label><select aria-label="Resposta correta">${symbols.map((s, j) => `<option value="${j}" ${q.correct === j ? 'selected' : ''}>${s} Alternativa ${j + 1}</option>`).join('')}</select><button class="back remove" data-index="${i}">Remover pergunta</button></div>`).join(''); document.querySelectorAll('.remove').forEach(b => b.onclick = () => { collect(); draft.splice(Number(b.dataset.index), 1); draw(); }); bindQuestionImages(); }
const displayedScores = new Map();
function bindQuestionImages() {
    document.querySelectorAll('.remove-image').forEach(button => button.onclick = () => {
        collect(); draft[Number(button.dataset.index)].image = ''; draw();
    });
    document.querySelectorAll('.image-upload').forEach(input => input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
            input.value = ''; return notice('Escolha uma imagem JPG, PNG ou WebP de até 10 MB.');
        }
        const row = input.closest('.question-edit');
        input.disabled = true;
        const url = URL.createObjectURL(file);
        try {
            const image = new Image(); image.src = url; await image.decode();
            const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            let data;
            for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
                data = canvas.toDataURL('image/jpeg', quality);
                if (data.length <= 300000) break;
            }
            if (data.length > 300000) throw new Error('Imagem muito detalhada. Escolha uma imagem menor.');
            if (!row.isConnected) return;
            row.dataset.image = data;
            collect(); draw();
        } catch (error) { notice(error.message || 'Não foi possível abrir essa imagem.'); }
        finally { URL.revokeObjectURL(url); input.disabled = false; input.value = ''; }
    });
}
let scoreFrame = null;
let scoreRenderVersion = 0;
let scoreRound = null;
function scoreLabel(name, score) {
    const shown = displayedScores.get(name) ?? 0;
    return `<span class="score-number" data-score-name="${esc(name)}" data-score-target="${score}">${Math.min(shown, score).toLocaleString('pt-BR')}</span>`;
}
function animateScores(timing = null) {
    const elements = [...app.querySelectorAll('[data-score-target]')];
    const starts = scoreRound?.starts || new Map(elements.map(el => [el.dataset.scoreName, displayedScores.get(el.dataset.scoreName) ?? 0]));
    if (scoreRound && scoreRound.startedAt === null) scoreRound.startedAt = performance.now();
    const startTime = scoreRound?.startedAt ?? performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(now) {
        const elapsed = timing ? (timing.context.currentTime - timing.startedAt) * 1000 : now - startTime;
        const duration = timing?.duration || (scoreRound ? 8000 : 1100);
        const progress = Math.max(0, Math.min(1, elapsed / duration));
        // While synchronized, count at a constant speed for the entire sound.
        const eased = reducedMotion ? 1 : (timing || scoreRound) ? progress : 1 - Math.pow(1 - progress, 3);
        for (const el of elements) {
            const name = el.dataset.scoreName, target = Number(el.dataset.scoreTarget);
            const from = Math.min(starts.get(name) ?? 0, target);
            const value = progress === 1 ? target : Math.floor(from + (target - from) * eased);
            el.textContent = value.toLocaleString('pt-BR');
            el.classList.toggle('score-increasing', !reducedMotion && progress < 1 && target > from);
            displayedScores.set(name, value);
        }
        const nextButton = document.querySelector('#next');
        if (nextButton) nextButton.disabled = progress < 1;
        scoreFrame = progress < 1 && elements.length ? requestAnimationFrame(tick) : null;
    }
    tick(startTime);
}
function ranking(players) { return `<div class="ranking">${players.map((p, i) => `<div class="rank"><span>${i === 0 ? '🏆' : i + 1}</span>${avatarHTML(p)}<b>${esc(p.name)}${p.online ? '' : ' · offline'}</b><b>${scoreLabel(p.name, p.score)} pts</b></div>`).join('')}</div>`; }
function render(s) {
    if (s.phase === 'finished' && state?.phase === 'finished' && s.pin === state.pin) return;
    const version = ++scoreRenderVersion;
    if (scoreFrame !== null) cancelAnimationFrame(scoreFrame);
    const newGame = !state || state.pin !== s.pin || s.phase === 'lobby';
    if (newGame) { displayedScores.clear(); scoreRound = null; }
    // Commit the previous round's authoritative totals before entering another phase.
    if (!newGame && state.phase === 'results' && (s.phase !== 'results' || state.index !== s.index)) {
        for (const player of state.players) displayedScores.set(player.name, player.score);
        scoreRound = null;
    }
    if (s.phase === 'results' && (!scoreRound || scoreRound.key !== s.pin + ':' + s.index)) {
        scoreRound = { key: s.pin + ':' + s.index, starts: new Map(displayedScores), startedAt: null };
    }
    const timing = gameAudio.update(s);
    renderGame(s);
    if (s.role === 'player' && s.phase === 'results') {
        document.querySelector('.status').insertAdjacentHTML('afterend', `<p class="personal-score">Sua pontuação: <b>${scoreLabel(s.name, s.score)} pontos</b></p>`);
    }
    const nextButton = document.querySelector('#next');
    if (nextButton) nextButton.disabled = true;
    Promise.resolve(timing).then(sync => {
        if (version === scoreRenderVersion && state === s) animateScores(sync);
    });
}
function renderGame(s) {
    state = s; deadline = Date.now() + s.remaining * 1000;
    if (s.phase === 'lobby') {
        app.innerHTML = `<section class="center"><div class="eyebrow">${s.role === 'host' ? 'Convide a turma' : 'Você está dentro'}</div><h1>${s.role === 'host' ? 'O desafio vai começar.' : `Olá, ${esc(s.name)}!`}</h1><p>Abra o endereço do apresentador e use o PIN do jogo</p><div class="room-pin">${s.pin}</div><p>${esc(location.host || 'localhost:8000')} · ${s.players.length} jogador(es)</p><div class="players">${s.players.map(p => `<span class="chip">✦ ${esc(p.name)}</span>`).join('') || '<p>Aguardando os primeiros jogadores…</p>'}</div>${s.role === 'host' ? '<button id="start">Começar o quiz →</button>' : '<div class="status">Aguarde o apresentador iniciar a partida.</div><form id="rename" class="nickname-form"><label for="new-name">Quer trocar seu apelido?</label><div class="nickname-row"><input id="new-name" minlength="2" maxlength="24" autocomplete="nickname" value="${esc(s.name)}" required><button>Salvar apelido</button></div></form>'}</section>`;
        if (s.role === 'host') document.querySelector('#start').onclick = () => send({ action: 'start' });
        else {
            document.querySelector('#rename').onsubmit = e => { e.preventDefault(); send({ action: 'rename', name: document.querySelector('#new-name').value.trim() }); };
            document.querySelector('#rename').insertAdjacentHTML('afterend', avatarPicker(s.avatar || ''));
            bindAvatarPicker(true);
        }
        return;
    }
    if (s.phase === 'finished') { app.innerHTML = `<section class="center"><div class="eyebrow">Quiz concluído</div><h1>O pódio é de vocês! 🎉</h1>${podium(s.players)}${s.players.length > 3 ? `<h2>Classifica??o completa</h2>${ranking(s.players)}` : ''}${s.role === 'player' ? `<p>Sua pontuação: <b>${scoreLabel(s.name, s.score)} pontos</b></p>` : ''}<button id="again">Voltar ao início</button></section>`; document.querySelector('#again').onclick = () => location.reload(); return; }
    const results = s.phase === 'results', answered = s.selected !== undefined && s.selected !== null;
    app.innerHTML = `<div class="meta"><span>Pergunta <b>${s.index + 1}</b> / ${s.total} · PIN ${s.pin}</span><span class="timer" id="timer">${results ? '✓' : Math.ceil(s.remaining)}</span></div><div class="progress"><div id="bar" style="width:${results ? 100 : s.remaining / s.duration * 100}%"></div></div><h2 class="question">${esc(s.question.text)}</h2>${s.question.image ? `<figure class="question-media"><img src="${esc(s.question.image)}" alt="Imagem da pergunta"></figure>` : ''}<div class="answers">${s.question.options.map((o, i) => `<button class="answer ${results ? (i === s.correct ? 'correct' : 'muted') : (s.selected === i ? 'selected' : '')}" data-choice="${i}" ${results || answered || s.role === 'host' ? 'disabled' : ''}><span class="symbol">${symbols[i]}</span>${esc(o)}${results && i === s.correct ? ' ✓' : ''}</button>`).join('')}</div><div class="status">${results ? (s.role === 'player' ? (s.selected === s.correct ? 'Boa! Você acertou.' : answered ? 'Essa não foi a resposta correta.' : 'Tempo esgotado.') : 'Resposta revelada!') : answered ? 'Resposta enviada! Aguarde a turma.' : s.role === 'host' ? `${s.answers} de ${s.players.filter(p => p.online).length} respostas recebidas` : 'Escolha uma alternativa. Quanto mais rápido, mais pontos!'}</div>${results ? ranking(s.players) : ''}${results && s.role === 'host' ? `<div class="center"><button id="next">${s.index + 1 === s.total ? 'Ver resultado final' : 'Próxima pergunta'} →</button></div>` : ''}`;
    document.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-choice]').forEach(el => el.disabled = true); send({ action: 'answer', choice: Number(b.dataset.choice) }); });
    if (document.querySelector('#next')) document.querySelector('#next').onclick = () => send({ action: 'next' });
}
home();
socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host || 'localhost:8000'}/ws`);
socket.onopen = () => { connected = true; document.querySelector('#connection').textContent = '● Servidor conectado'; };
socket.onclose = () => { gameAudio.reset(); connected = false; document.querySelector('#connection').textContent = 'Servidor desconectado'; notice('Conexão encerrada. Recarregue para entrar novamente.'); document.querySelectorAll('button').forEach(b => b.disabled = true); };
socket.onerror = () => notice('Não foi possível conectar. Verifique se server.py está rodando.');
socket.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.type === 'error') {
        saving = false; const button = document.querySelector('#save-quiz'); if (button) button.disabled = false;
        notice(data.message);
    } else if (data.type === 'account_authenticated') {
        account = data.user;
        if (draft.length || quizTitle) { editor(); notice('Conta conectada. Agora você pode salvar seu quiz.'); } else openLibrary();
    } else if (data.type === 'logged_out') {
        account = null; draft = []; quizId = null; quizTitle = ''; quizDuration = 20; home();
    } else if (data.type === 'quiz_list') library(data.quizzes);
    else if (data.type === 'quiz_loaded') {
        quizId = data.quiz.id; quizTitle = data.quiz.title; quizDuration = data.quiz.duration; draft = data.quiz.questions; editor();
    } else if (data.type === 'quiz_saved') {
        saving = false; quizId = data.quiz.id; quizTitle = data.quiz.title;
        const button = document.querySelector('#save-quiz'); if (button) button.disabled = false;
        notice('Quiz salvo na sua conta!');
    } else if (data.type === 'closed') { state = null; home(); notice(data.message); }
    else if (data.type === 'state') render(data);
};
setInterval(() => { if (state?.phase !== 'question') return; const remaining = Math.max(0, (deadline - Date.now()) / 1000), timer = document.querySelector('#timer'), bar = document.querySelector('#bar'); gameAudio.countdown(state, remaining); if (timer) timer.textContent = Math.ceil(remaining); if (bar) bar.style.width = `${remaining / state.duration * 100}%`; }, 100);
