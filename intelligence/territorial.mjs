import { mkdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const folder = new URL('./output/', import.meta.url)
mkdirSync(folder, { recursive: true })
const db = new DatabaseSync(new URL('./territory.sqlite', folder))
const days = 730
const split = 545
const threshold = 0.35
const territories = ['Setor Norte', 'Setor Sul', 'Setor Leste', 'Setor Oeste']
let seed = 42
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 2 ** 32
}

db.exec(`
  BEGIN;
  DROP TABLE IF EXISTS raw_observations;
  DROP TABLE IF EXISTS observations;
  CREATE TABLE raw_observations (
    day INTEGER, territory TEXT, rain REAL, coverage REAL, reported INTEGER
  ) STRICT;
  CREATE TABLE observations (
    day INTEGER, territory TEXT, rain REAL NOT NULL CHECK (rain BETWEEN 0 AND 100),
    coverage REAL NOT NULL CHECK (coverage BETWEEN 0 AND 1),
    reported INTEGER NOT NULL CHECK (reported IN (0, 1)),
    PRIMARY KEY (day, territory)
  ) STRICT;
`)
const insert = db.prepare('INSERT INTO raw_observations VALUES (?, ?, ?, ?, ?)')
for (let day = 0; day < days; day++) {
  for (const [index, territory] of territories.entries()) {
    const season = 1 + 0.45 * Math.cos(day * 2 * Math.PI / 365)
    const rain = Math.min(100, Math.round(75 * season * random() ** 2))
    const coverage = Math.round((0.45 + 0.12 * index + 0.18 * random()) * 100) / 100
    const flood = random() < 1 / (1 + Math.exp(3.4 - 0.087 * rain - 0.25 * index))
    const reported = Number(flood && random() < coverage)
    insert.run(day, territory, random() < 0.025 ? null : rain, coverage, reported)
  }
}

db.exec(`
  INSERT INTO observations
    SELECT day, territory, rain, coverage, reported FROM raw_observations
    WHERE rain BETWEEN 0 AND 100 AND coverage BETWEEN 0 AND 1 AND reported IN (0, 1);
  COMMIT;
`)
const training = db.prepare('SELECT * FROM observations WHERE day < ?').all(split - 1)
const testing = db.prepare('SELECT * FROM observations WHERE day >= ?').all(split)
const bin = rain => rain < 20 ? 0 : rain < 45 ? 1 : 2
const bands = ['0 a 19', '20 a 44', '45 a 100'].map((label, index) => {
  const rows = training.filter(row => bin(row.rain) === index)
  const reports = rows.reduce((total, row) => total + row.reported, 0)
  return { label, rows: rows.length, reports, probability: (reports + 1) / (rows.length + 2) }
})
const baseline = training.reduce((total, row) => total + row.reported, 0) / training.length
const estimate = row => bands[bin(row.rain)].probability
const eligible = row => row.coverage >= 0.65 && bands[bin(row.rain)].rows >= 30

function evaluate(rows) {
  const scored = rows.filter(eligible)
  let trueAlerts = 0
  let falseAlerts = 0
  let missed = 0
  let reported = 0
  let brier = 0
  let baselineBrier = 0
  for (const row of rows) {
    reported += row.reported
    if (!eligible(row)) continue
    const probability = estimate(row)
    if (probability >= threshold) {
      if (row.reported) trueAlerts++
      else falseAlerts++
    } else if (row.reported) missed++
    brier += (probability - row.reported) ** 2
    baselineBrier += (baseline - row.reported) ** 2
  }
  const ratio = (a, b) => b ? a / b : null
  return {
    total: rows.length, scored: scored.length, reported, trueAlerts, falseAlerts, missed,
    precision: ratio(trueAlerts, trueAlerts + falseAlerts),
    recall: ratio(trueAlerts, trueAlerts + missed),
    reach: ratio(scored.length, rows.length),
    captured: ratio(trueAlerts, reported),
    brier: ratio(brier, scored.length),
    baselineBrier: ratio(baselineBrier, scored.length),
  }
}

const rawRows = db.prepare('SELECT count(*) AS total FROM raw_observations').get().total
const cleanRows = db.prepare('SELECT count(*) AS total FROM observations').get().total
const result = {
  dataset: { rawRows, cleanRows, training: training.length, testing: testing.length, testStart: '2025-06-29' },
  threshold, minCoverage: 0.65, bands,
  evaluation: evaluate(testing),
  territories: territories.map(name => ({ name, ...evaluate(testing.filter(row => row.territory === name)) })),
}
db.close()
writeFileSync(new URL('../src/territorialModel.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
process.stdout.write(JSON.stringify(result.evaluation) + '\n')

