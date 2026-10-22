(() => {
    const trigger = document.querySelector('#secret-trigger');
    const dialog = document.querySelector('#secret-player');
    const video = document.querySelector('#secret-video');
    const music = document.querySelector('#secret-music');
    const error = document.querySelector('#secret-error');
    let generation = 0;
    function stop() {
        generation++;
        video.pause(); music.pause();
        video.currentTime = 0; music.currentTime = 0;
        gameAudio.mediaActive = false;
    }
    trigger.onclick = async () => {
        const run = ++generation;
        error.hidden = true;
        gameAudio.stop();
        gameAudio.mediaActive = true;
        dialog.showModal();
        video.currentTime = 0; music.currentTime = 0;
        // Start both from the click so browser autoplay rules allow the music.
        const results = await Promise.allSettled([video.play(), music.play()]);
        if (run !== generation) return;
        if (results.some(result => result.status === 'rejected')) {
            stop();
            error.textContent = 'Não foi possível reproduzir. Reinicie o servidor, atualize a página e tente novamente.';
            error.hidden = false;
        }
    };
    document.querySelector('#secret-close').onclick = () => dialog.close();
    dialog.addEventListener('close', stop);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    music.addEventListener('ended', () => dialog.close());
    for (const media of [video, music]) media.addEventListener('error', () => {
        if (!dialog.open) return;
        stop(); error.textContent = 'Não foi possível carregar o vídeo ou a música.'; error.hidden = false;
    });
})();
