# Controle Mobile

Protótipo de gerenciamento **autorizado** de Android pelo Windows. Há três componentes: aplicativo Android, console Windows e relay HTTPS. Cada aparelho conecta ao mesmo relay; computador e Android podem estar em redes diferentes, incluindo internet móvel e redes com NAT.

## Estado e limites

O servidor tem testes de integração; a interface desktop pode rodar com Python/Tk. Consulte `VALIDACAO.md` para os resultados da compilação. A operação completa precisa de validação em Android físico e de um servidor HTTPS público configurado. Não há hospedagem contratada nem endereço externo configurado neste projeto.

- Android 8 ou superior; compilação com SDK 35, Java 17 e Gradle 8.9.
- Bateria, conexão, versão do Android e disponibilidade por heartbeat de aproximadamente 2 segundos enquanto o gerenciamento estiver ativo.
- Última localização com horário e precisão. Coleta aproximadamente a cada 30 segundos ou 10 metros, conforme GPS/rede. A localização pode estar desatualizada; confira `time` e `accuracy_m` no status. Esta versão não mantém histórico de trajetos.
- Bloqueio da tela usando administração de dispositivo com a única política `force-lock`. Não apaga dados, não remove senha e não desbloqueia remotamente.
- Tela em JPEG, até cerca de 1 quadro por segundo e 720 pixels no maior lado. Sem áudio; latência depende da internet. Telas protegidas podem aparecer pretas.
- Clique e arraste na tela do Windows para enviar toque e gesto; botões Voltar e Início. Requer acessibilidade habilitada pelo usuário e sessão de captura ativa. Não inclui teclado remoto.
- A captura exige consentimento no Android a cada sessão. Ao girar o aparelho, a sessão termina para evitar coordenadas incorretas; autorize novamente. Queda de comunicação por 15 segundos interrompe a captura; o gerenciamento continua tentando reconectar.
- Não inicia oculto nem automaticamente após reiniciar o aparelho. Abra o aplicativo e ative o gerenciamento. Android/fabricante pode encerrar processos ou limitar localização com a tela apagada; disponibilidade contínua ainda precisa de testes e de uma etapa própria de gerenciamento empresarial/MDM.
- O aplicativo usa permissões comuns e administração legada para bloqueio. Esta versão **não** implementa provisionamento Device Owner, quiosque ou políticas empresariais completas.

## 1. Servidor local para teste

No PowerShell, dentro da pasta do projeto:

```powershell
$env:CONTROL_ADMIN_TOKEN = py -c "import secrets; print(secrets.token_urlsafe(32))"
py server/server.py
```

Guarde a chave em um gerenciador de senhas. O console precisa da mesma chave; não compartilhe a chave com o Android. Para visualizar a variável no seu terminal, use `$env:CONTROL_ADMIN_TOKEN`. Ela não é gravada automaticamente em arquivo.

O servidor escuta apenas em `127.0.0.1:8787`. O desktop aceita `http://127.0.0.1:8787` para esse teste. Android aceita apenas HTTPS com certificado válido. Não exponha a porta interna diretamente na internet.

O banco SQLite é criado em `control.sqlite3` ou no caminho `CONTROL_DB`. Ele contém tokens de dispositivos em hash, último status/localização, comandos das últimas 24 horas e registros de acesso dos últimos 30 dias. A limpeza ocorre durante novas operações. Frames ficam somente na memória: uma imagem por aparelho, nunca são servidos após cinco segundos sem atualização e são removidos ao parar/revogar quando há conexão. Proteja o banco e seus backups.

## 2. Acesso pela internet

Em um servidor Linux com Docker Compose, aponte o DNS de um domínio ao IP público do servidor e libere TCP 80/443. Copie `server/` e `deploy/` preservando a estrutura. Na pasta `deploy/`, configure:

```sh
export CONTROL_DOMAIN=controle.seudominio.com
export CONTROL_ADMIN_TOKEN='SUA_CHAVE_ALEATORIA_COM_PELO_MENOS_32_CARACTERES'
docker compose up -d --build
```

O Caddy solicita certificado HTTPS automaticamente para o domínio. Nenhum serviço externo foi criado por este projeto. O volume `relay-data` persiste o banco. Em produção, proteja o host, os volumes e a chave; este protótipo é de um único administrador, sem contas individuais ou MFA. Os limites de pareamento são globais por IP percebido pelo relay (por trás do proxy, compartilhados), em memória e reiniciam com o processo.

Para trocar a chave administrativa, atualize a variável e recrie o relay; atualize o console Windows. Dispositivos permanecem pareados até serem revogados individualmente.

## 3. Windows

Execute `dist/ControleMobile/ControleMobile.exe`, mantendo a pasta `_internal` ao lado dele. Para usar pelo código:

```powershell
py -m pip install --target .tools/python -r desktop/requirements.txt
py desktop/app.py
```

Também há o atalho `Abrir Desktop.cmd`. Informe a URL HTTPS do relay e a chave administrativa e clique **Conectar**. A chave fica apenas em memória durante a sessão.

Clique **Parear Android** para obter um código de uso único válido por cinco minutos. Instale o APK no aparelho, informe a mesma URL e o código. Depois selecione o aparelho no console.

O botão **Histórico de comandos** distingue comandos aguardando execução, executados, recusados e expirados. Comandos sem confirmação podem ser reenviados ao agente, que evita repetições durante o mesmo processo. Não há garantia de execução exatamente uma vez se o processo Android morrer entre executar e confirmar. Comandos expiram após 30 segundos; nenhum comando remoto deve ser considerado confirmado apenas porque foi enfileirado.

Para gerar o executável:

```powershell
py -m pip install --target .tools/python pyinstaller
py scripts/build-desktop.py
```

## 4. Android

Compile com o script abaixo, que baixa as ferramentas dentro de `.tools/`. As licenças do SDK serão solicitadas interativamente; `-AcceptSdkLicenses` permite aceitá-las de forma automática quando autorizado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-android.ps1
```

Ou abra `android/` no Android Studio e gere o APK de depuração. O script copia o resultado para `dist/ControleMobile-debug.apk`. A versão de depuração serve para testes; uma distribuição definitiva requer chave de assinatura própria guardada com segurança.

Se os downloads adicionais do Gradle falharem, depois de preparar o SDK use `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-android.ps1 -OfflineBuild`. Esse modo compila o mesmo código com javac, AAPT2, D8, zipalign e apksigner locais, sem dependências externas. A chave de testes fica em `.tools/controle-debug.keystore`; preserve-a para atualizar o APK sem mudar a assinatura. Ela tem senha pública de desenvolvimento e não deve ser usada em produção.

No aparelho:

1. Instale o APK e abra **Controle Mobile**.
2. Informe URL HTTPS e código gerado no Windows; toque **Parear**.
3. Conceda localização e notificações, e toque **Ativar gerenciamento**. Se conceder localização depois, pare e ative novamente o gerenciamento.
4. Ative a administração para permitir bloqueio e a acessibilidade para permitir gestos.
5. Toque **Compartilhar tela** e confirme a janela oficial do Android. A tela inteira é compartilhada.
6. Use a notificação ou o aplicativo para parar. **Desvincular aparelho** revoga o token no relay; precisa de conexão para confirmar. Se não houver internet, o gerenciamento local é parado e a revogação deve ser repetida quando a conexão voltar.

No Android instalado fora da loja, as configurações de acessibilidade podem exigir autorização adicional de “configurações restritas”, conforme o fabricante e a versão. Não há mecanismo para contornar as confirmações do sistema.

O token do aparelho fica em SharedPreferences privadas, sem backup Android. A coleta de localização não usa serviço externo contratado pelo projeto. Ao clicar em **Abrir última localização no mapa** no desktop, as coordenadas são enviadas ao OpenStreetMap no navegador.

## Verificação

```powershell
py -m unittest discover -s tests -v
py -m compileall -q server desktop
```

Antes do uso real, valide em aparelhos físicos: Wi-Fi e 4G/5G em redes diferentes, perda/retorno de sinal, bloqueio, rotação, revogação, permissões negadas, encerramento pelo sistema e precisão do GPS. Não há aparelho conectado ou teste físico registrado neste projeto.

Referências técnicas: [MediaProjection](https://developer.android.com/media/grow/media-projection), [serviços de primeiro plano](https://developer.android.com/develop/background-work/services/fgs/service-types), [gestos de acessibilidade](https://developer.android.com/guide/topics/ui/accessibility/service).
