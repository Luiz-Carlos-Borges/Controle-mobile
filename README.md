# Quiz Live

Quiz multiplayer em português com salas por PIN, perguntas personalizadas, cronômetro, pontuação por velocidade e ranking.

## Executar

Instale Python 3.10 ou superior. Na pasta do projeto:

```powershell
py -m pip install -r requirements.txt
py server.py
```

Abra http://localhost:8000. Clique em **Quero apresentar um quiz**, use as cinco perguntas prontas ou adicione suas perguntas e crie a sala. Em outra aba ou dispositivo, entre com o PIN e um apelido. O apresentador inicia e avança entre as rodadas.

Para celulares na mesma rede Wi-Fi, use `http://IP-DO-COMPUTADOR:8000`. Consulte seu IPv4 com `ipconfig`; localhost no celular aponta para o próprio celular. Se necessário, permita a porta 8000 no firewall da rede privada.

Acertos valem de 500 a 1.000 pontos conforme a velocidade. O servidor controla tempo e respostas, aceita uma resposta por jogador e revela a alternativa correta ao terminar a rodada. Se todos responderem, a rodada termina antecipadamente.

As salas ficam em memória; reiniciar o servidor apaga as partidas. Desconectar o apresentador encerra a sala. Jogadores desconectados durante a partida mantêm seus pontos no ranking, mas precisam de uma nova partida para entrar novamente. A versão é para uso local em uma rede confiável.

## Contas e quizzes salvos

Clique em **Minha conta · Salvar meus quizzes** e crie uma conta com nome de usuário e senha própria (mínimo de seis caracteres). Em **Meus quizzes**, use **Novo quiz**, preencha o título e as perguntas e clique em **Salvar na minha conta**. Depois de entrar novamente, abra o quiz em **Abrir e editar**, altere o conteúdo e salve para atualizar o mesmo quiz.

Sua conta funciona em outros dispositivos conectados ao mesmo servidor. A sessão termina ao atualizar a página ou desconectar, mas os dados permanecem. Jogadores podem continuar entrando apenas com PIN e apelido. Apresentar uma partida n?o exige senha de apresentador.

Contas e quizzes são armazenados em `data/quizlive.db` no computador que executa o servidor e sobrevivem às reinicializações. Faça backup dessa pasta com o servidor parado. As senhas são armazenadas com hash PBKDF2 e salt, e cada conta acessa apenas seus quizzes. O servidor HTTP disponibiliza somente os arquivos públicos da interface. Esta instalação local usa HTTP/WebSocket sem criptografia; não exponha na internet sem configurar HTTPS/WSS.

Verificação: `py test_game.py`, `py test_accounts.py` e `node --check app.js`. Os testes de contas usam um banco temporário e não alteram suas contas reais.
