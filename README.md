# Imagine Publisher

Plataforma para organizar e agendar as publicações dos artistas. O time (ou o social media do artista) sobe o vídeo uma vez, escolhe as redes, a legenda e o horário. O sistema deixa tudo pronto, e quem publica só abre o app, escolhe o áudio oficial e posta.

## Como cada rede funciona

| Rede | Modo | O que acontece |
|---|---|---|
| TikTok | Rascunho | No horário marcado, o vídeo vai para a caixa de entrada do TikTok do artista. Falta só escolher o áudio e publicar no app. |
| Instagram | Rascunho (padrão) | Vira uma pendência com vídeo e legenda prontos. Você finaliza no app, mantendo áudio oficial e sincronia com o Facebook. |
| Instagram | Publicar direto | Opcional por post. O servidor publica o Reel pela API. Não aplica áudio oficial. |
| YouTube | Pendência manual | Ainda sem integração por API. |

## Subir na VPS (comandos de uma linha)

Antes de apagar o sistema antigo, guarde as chaves dele:

    cp /opt/bcg-music-publisher/.env /root/publisher-antigo.env

Remover o sistema antigo:

    docker rm -f bcg-music-publisher imagine-publisher; docker rmi bcg-music-publisher-bcg-music-publisher; rm -rf /opt/bcg-music-publisher /opt/bcg-music-publisher-backup-* /opt/imagine-publisher

Clonar e subir (troque SEU_USUARIO):

    cd /opt && git clone https://github.com/SEU_USUARIO/imagine-publisher.git && cd imagine-publisher && printf 'APP_SECRET=%s\nPUBLIC_BASE_URL=https://publisher.imaginegroup.com.br\nMAX_UPLOAD_MB=500\n' "$(openssl rand -hex 32)" > .env && docker compose up -d --build

Conferir:

    docker ps --format '{{.Names}} {{.Status}}' | grep imagine; curl -s https://publisher.imaginegroup.com.br/health

Atualizar depois:

    cd /opt/imagine-publisher && git pull && docker compose up -d --build

Backup (guarde o `.env` e a pasta `data`):

    cp /opt/imagine-publisher/.env /root/imagine-publisher.env.bak && tar czf /root/imagine-data-$(date +%F).tgz -C /opt/imagine-publisher data

O `APP_SECRET` protege as chaves das redes guardadas no banco. Se ele se perder, é preciso preencher as Integrações de novo.

## Primeiro uso

1. Abra o endereço e crie o acesso do time.
2. Em **Integrações**, cole as chaves do TikTok e do Instagram e confira as Redirect URIs mostradas na tela.
3. Em **Artistas**, cadastre o artista, clique em **Copiar link de conexão** e envie ao artista. Ele conecta as próprias contas, sem você entrar nelas.
4. Em **Novo post**, suba o vídeo, escolha as redes e o horário.

Enquanto os apps estiverem em modo de teste, cada conta precisa estar cadastrada como Target User (TikTok Sandbox) e como Instagram Tester (Meta).

## Estrutura

    server/   API Node 22 + TypeScript + Express + SQLite (worker de agendamento incluso)
    web/      Interface React + Vite
    tests/    Testes de ponta a ponta com TikTok e Instagram simulados (node tests/test.mjs, depois do build do server)

O envio do vídeo ao TikTok é feito em streaming direto do disco, e o container tem limite de memória (512 MB) para não afetar os outros serviços da VPS.
