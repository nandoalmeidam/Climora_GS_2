"""Fit a baseline for occurrence reports in the following 24 hours."""
import argparse
import csv
from datetime import date, timedelta
import json
import math
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import joblib

FEATURES = ("rain_24h_mm", "rain_72h_mm", "reports_last_30d")


def features(row):
    values = [float(row[field]) for field in FEATURES]
    if not all(math.isfinite(value) and value >= 0 for value in values):
        raise ValueError("Os indicadores devem ser números finitos e não negativos.")
    return values


def train(source, artifact):
    with source.open(encoding="utf-8-sig", newline="") as file:
        records = [(date.fromisoformat(row["issued_date"]), features(row), int(row["reported_next_24h"]))
                   for row in csv.DictReader(file)]
    dates = sorted({day for day, _, _ in records})
    if len(dates) < 10:
        raise ValueError("São necessárias pelo menos 10 datas para separar treino e validação.")
    cutoff = dates[int(len(dates) * 0.8)]
    training = [(x, y) for day, x, y in records if day < cutoff - timedelta(days=1)]
    validation = [(x, y) for day, x, y in records if day >= cutoff]
    if any({y for _, y in group} != {0, 1} for group in (training, validation)):
        raise ValueError("Treino e validação precisam conter exemplos positivos e negativos com rótulos 0/1.")
    inputs, labels = zip(*training)
    model = make_pipeline(StandardScaler(), LogisticRegression())
    model.fit(inputs, labels)
    inputs, labels = zip(*validation)
    predictions = model.predict_proba(inputs)[:, 1]
    metrics = {
        "validation_start": cutoff.isoformat(),
        "training_rows": len(training),
        "validation_rows": len(validation),
        "positive_rate": sum(labels) / len(labels),
        "average_precision": average_precision_score(labels, predictions),
        "roc_auc": roc_auc_score(labels, predictions),
        "brier_score": brier_score_loss(labels, predictions),
    }
    joblib.dump({"model": model, "metrics": metrics}, artifact)
    return metrics


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    training = commands.add_parser("train")
    training.add_argument("csv", type=Path)
    training.add_argument("artifact", type=Path)
    scoring = commands.add_parser("score")
    scoring.add_argument("artifact", type=Path)
    for name in FEATURES:
        scoring.add_argument(name, type=float)
    args = parser.parse_args()
    if args.command == "train":
        result = train(args.csv, args.artifact)
    else:
        model = joblib.load(args.artifact)["model"]
        result = {"estimated_reporting_probability": float(model.predict_proba([features(vars(args))])[0, 1])}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
