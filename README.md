# Climora

Plataforma de análise territorial para antecipar problemas que afetam a qualidade de vida. O primeiro recorte é a análise da chuva e de relatos de alagamento nas próximas 24 horas. Na página **Análise de risco**, o monitoramento municipal usa previsão pública e o painel de antecipação permite explorar um modelo estatístico com dados sintéticos.

## Executar localmente

```sh
npm ci
npm run dev
```

## APK Android

O Climora usa Capacitor para empacotar o aplicativo web no Android. A compilação exige JDK 21 e o SDK Android 36. Configure `JAVA_HOME` e `ANDROID_HOME` antes de executar os comandos abaixo no PowerShell.

```powershell
npm ci
npm run build
npx cap sync android
.\android\gradlew.bat -p android assembleDebug
```

O APK de teste fica em `android/app/build/outputs/apk/debug/app-debug.apk`. A configuração web do Firebase em `.env.local` é usada pelo build. A previsão, o mapa e os registros dependem de conexão com a internet.

A central abre sempre na cidade de São Paulo ao iniciar ou recarregar o aplicativo. Ao selecionar um país, o painel atualiza usando a capital ou outra cidade de referência do catálogo. As cidades de referência foram selecionadas a partir dos arquivos cities500 e countryInfo do [GeoNames](https://www.geonames.org/export/) (CC BY 4.0). No Brasil, você pode trocar estado e município pelo catálogo do IBGE. Nos demais países e territórios, escolha uma cidade na lista do GeoNames, carregada sob demanda para o país selecionado. O catálogo usa o arquivo cities5000 (CC BY 4.0). Para localidades que não aparecem na lista, use Buscar outra. O bairro é opcional e pode ser digitado. O mapa, os avisos e os registros usam a localidade aplicada. A previsão do Open-Meteo usa as coordenadas de referência da cidade e seu horário local. A cobertura de cidades e detalhes administrativos depende do catálogo de origem. As sugestões de bairro vêm dos subdistritos disponíveis no IBGE e o campo também aceita nomes digitados.

O painel combina o catálogo do [IBGE](https://servicodados.ibge.gov.br/api/docs/localidades), a [geocodificação do Open-Meteo](https://open-meteo.com/en/docs/geocoding-api), baseada no GeoNames, a previsão do [Open-Meteo](https://open-meteo.com/en/docs) e o mapa do [OpenStreetMap](https://www.openstreetmap.org/copyright). O histórico recente de chuva e temperatura corresponde às estimativas de modelo do Open-Meteo. Os avisos do [INMET](https://avisos.inmet.gov.br/) são consultados pelo portal oficial no Brasil. No exterior, o Climora aponta para o [centro de avisos da OMM](https://severeweather.wmo.int/), cuja cobertura depende dos serviços meteorológicos participantes.

## Firebase Spark

O modo padrão usa Authentication por e-mail e senha, Firestore e Firebase Hosting. Preencha a configuração web em `.env.local` a partir de `.env.example`.

1. No Firebase Authentication, copie o UID da conta que fará a moderação.
2. No console do Firestore, crie o documento `moderators/UID_DA_CONTA` com o campo booleano `enabled` igual a `true`. Os clientes só podem consultar o próprio documento de acesso. Para revogar a permissão, altere `enabled` para `false`.
3. Implante as regras e os índices em `climora-47861`. Quando quiser publicar a web, gere o build e implante o Hosting.

```sh
firebase deploy --only firestore --project climora-47861
npm run build
firebase deploy --only hosting --project climora-47861
```

No Spark, o relato é enviado sem foto. A aprovação atualiza o relato privado e cria sua versão pública na mesma transação. A publicação contém categoria, descrição e localização. A gestão de contas fica no console do Authentication.

O modo Blaze é opcional. Para habilitar fotos e as funções administrativas, configure Cloud Storage e Cloud Functions, ajuste a CORS do bucket para a origem do app, atribua a custom claim `admin: true` ao moderador e defina `VITE_FIREBASE_MODE=blaze` em `.env.local`. Implante as regras do Firestore pelo arquivo padrão e faça a implantação adicional com `firebase deploy --config firebase.blaze.json --project climora-47861`.

### Assistente de previsão

Na Visão geral, **Perguntar sobre o tempo** responde às perguntas mais comuns com a previsão do Open-Meteo da cidade selecionada. Para interpretar perguntas e redigir respostas com a OpenAI, habilite o Firebase Blaze, registre a chave no Secret Manager e implante a função:

```sh
firebase functions:secrets:set OPENAI_API_KEY --project climora-47861
firebase deploy --only functions:classifyWeatherQuestion --config firebase.blaze.json --project climora-47861
```

Defina `VITE_WEATHER_AI=true` em `.env.local` antes de gerar e publicar o build web. As respostas geradas pela IA ficam disponíveis aos usuários autenticados, com até 20 chamadas por conta a cada hora. A função envia à OpenAI a pergunta, a cidade, os dados de referência da previsão e, quando disponível, o assunto e o dia da consulta anterior. Os valores da previsão vêm do Open-Meteo.

As regras de moderação podem ser testadas com o emulador local usando o Firebase CLI e Java.

```sh
firebase emulators:exec --only firestore --project demo-climora "node tests/firestore-rules.mjs"
```
A PWA pode ser instalada a partir do navegador em HTTPS ou localhost. Após o primeiro acesso online, a interface de produção abre offline. Dados de clima, mapas e registros dependem de conexão. O acompanhamento oferece avisos no painel. Entrega de notificações push requer integração adicional.

## Análise territorial

O painel tem dois fluxos de dados. O monitoramento consulta o Open-Meteo e organiza as séries de chuva, temperatura e vento pela data local. A previsão tem resolução municipal. O cenário de pesquisa é separado e contém quatro setores fictícios, com um registro por setor e dia de emissão. A chuva indica o acumulado previsto para o horizonte seguinte de 24 horas. O rótulo é a ocorrência de ao menos um relato de alagamento nesse horizonte. A cobertura é a probabilidade de registro usada na simulação.

Reproduza o cenário com Node.js 24:

```sh
npm run data:territorial
```

O script cria as tabelas bruta e tratada em `intelligence/output/territory.sqlite`, descarta observações incompletas e exporta `src/territorialModel.json`. A base ignora qualquer conta, descrição, foto ou coordenada de morador. O arquivo SQLite local não segue para o navegador, que recebe somente as estatísticas agregadas.

O modelo estima a frequência de relatos por faixa de chuva com suavização de Laplace. O teste usa os dias mais recentes e há uma janela de 24 horas entre treino e teste. A referência de comparação é a frequência geral do treino, avaliada nos mesmos casos em que o modelo gera estimativa. O limiar demonstrativo de 35%, a cobertura mínima de 65% e o mínimo de 30 exemplos por faixa são escolhas didáticas. O painel permite testar a mudança de faixa e as condições de suspensão.

**Avaliação.** A precisão mede quantos alertas coincidiram com um relato. A sensibilidade considera os relatos entre casos com estimativa. Relatos sinalizados sobre o total incluem o efeito da abstenção. A cobertura mede quantos registros recebem estimativa. Brier mede erro probabilístico. Os resultados reproduzem padrões do simulador e não medem desempenho em cidades reais.

**Benefício social.** Em um piloto, compare o tempo entre a sinalização e a triagem humana, a proporção de relatos sinalizados e a carga de alarmes sem relato. Registre também a cobertura e o tempo de resposta por área para que setores com subnotificação entrem na avaliação. O painel mostra indicadores simulados de alcance e esforço. Tempo de resposta e benefício para moradores ainda precisam de coleta no piloto.

**Uso responsável.** Antes de testar com dados reais, obtenha dados autorizados e agregue por setor e dia, com supressão de grupos pequenos. Avalie desempenho por território, estação e cobertura. Drenagem, relevo, qualidade da previsão e diferenças de acesso aos canais de relato podem comprometer a estimativa. Combine canais digitais e presenciais, ofereça revisão humana e consulte os avisos oficiais para decisões de segurança. O cenário não aciona notificações nem decisões automáticas.

## Experimento de regressão logística

`intelligence/model.py` é um modelo inicial de regressão logística. Ele combina chuva prevista e histórico de relatos para estimar a chance de um novo relato nas próximas 24 horas. O CSV de treino deve conter:

| Coluna | Conteúdo |
| --- | --- |
| `issued_date` | Data em que a previsão estava disponível, em YYYY-MM-DD |
| `rain_24h_mm`, `rain_72h_mm` | Acumulados previstos com os dados disponíveis na emissão |
| `reports_last_30d` | Relatos históricos conhecidos na data da emissão |
| `reported_next_24h` | Rótulo 0 ou 1 para relato validado no horizonte de 24 horas |

Use a mesma unidade territorial em cada observação, inclua exemplos sem relato em períodos com cobertura de registro e mantenha os dados da previsão contemporâneos à emissão. A ausência de relato pode refletir subnotificação. A validação temporal reporta PR-AUC por precisão média, ROC-AUC e Brier. Para uso operacional, avalie o modelo por município, estação e cobertura de registros. A regressão é um experimento separado. O painel usa o modelo de frequência por faixas do pipeline sintético.

```sh
python -m pip install -r intelligence/requirements.txt
python intelligence/model.py train historico.csv modelo.joblib
python intelligence/model.py score modelo.joblib 25 52 3
```

## Verificação

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run lint
npm run build
```

O Playwright usa respostas controladas das APIs de clima e localidades para verificar a interface sem depender de serviços externos.



