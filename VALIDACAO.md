# Verificação da versão 0.1.0 — 19/10/2026

## Verificações realizadas

- Servidor: oito testes de integração HTTP aprovados com SQLite em memória. Cobrem pareamento de uso único e expiração, segredo armazenado em hash, autorização administrativa, isolamento entre aparelhos, entrega e confirmação de comandos, expiração de comandos, validação de gestos, remoção de quadros, revogação pelo computador/aparelho e preservação da última localização.
- Python: compilação sintática do servidor e do desktop aprovada.
- Windows: pacote gerado com PyInstaller 6.22.3 e Pillow 12.3.0. Teste de inicialização do executável com `--smoke-test` terminou com código 0; cria a interface Tk, decodifica JPEG e exibe a imagem antes de fechar.
- Android: código Java compilado com Java 17 e SDK 35. Compilação completa Gradle 8.9/AGP 8.7.3 aprovada com Build Tools 35.0.0 e AAPT2 local.
- Também foi validada a compilação alternativa com javac/AAPT2/D8/zipalign/apksigner, incluindo assinatura v2/v3. O APK final gerado pelo Gradle teve sua assinatura v2 verificada. Pacote `br.com.controlemobile`, versão `0.1.0`, Android mínimo API 26 e alvo API 35. Os hashes dos arquivos finais estão em `dist/SHA256SUMS.txt`.

## Arquivos de entrega

- `dist/ControleMobile/ControleMobile.exe`: executável Windows. Preserve a pasta `_internal` ao lado dele.
- `dist/ControleMobile-Windows.zip`: distribuição portátil Windows completa; extraia antes de executar.
- `dist/ControleMobile-debug.apk`: APK de testes. Transfira para o Android e instale com autorização do usuário.
- `deploy/GUIA-SERVIDOR.md`: roteiro para preparar seu VPS, domínio e certificado HTTPS.

## Ainda não validado

Não há dispositivo físico conectado e nenhum servidor público foi provisionado. Localização, administração de bloqueio, permissões, captura MediaProjection e gestos de acessibilidade foram implementados, mas ainda precisam de teste real nos modelos Android que serão usados. Não foi feito teste de desempenho, estabilidade com a tela apagada, reconexão prolongada ou carga com vários aparelhos. O container e a configuração Caddy/Docker Compose foram preparados, mas não executados neste computador.

O pacote é um protótipo para testes autorizados, de um único administrador. A versão de produção exige assinatura definitiva, validação física e operacional, revisão de segurança e melhorias de gerenciamento empresarial conforme o uso.
