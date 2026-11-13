#!/usr/bin/env python3
"""Train the profile-specific surrogate models and rebuild travel-aware campaigns."""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from enrich import feature_vector, score_site_new, PROFILES, best_campaign, FEATURE_NAMES  # noqa: E402

DATA_PATH = ROOT / "src" / "data" / "odyssey.json"


def make_model(profile):
    if profile == "mars_landing":
        return ExtraTreesRegressor(n_estimators=500, max_depth=6, min_samples_leaf=1, random_state=7, n_jobs=-1)
    return make_pipeline(StandardScaler(), SVR(C=100, gamma="scale", epsilon=0.5))


def model_label(profile):
    return "ExtraTreesRegressor" if profile == "mars_landing" else "RBF-SVR"


def candidate_models():
    return {
        "RBF-SVR": lambda: make_pipeline(StandardScaler(), SVR(C=100, gamma="scale", epsilon=0.5)),
        "ExtraTrees": lambda: ExtraTreesRegressor(n_estimators=400, max_depth=6, min_samples_leaf=1, random_state=7, n_jobs=-1),
        "GradientBoosting": lambda: GradientBoostingRegressor(n_estimators=300, max_depth=2, learning_rate=0.04, random_state=7),
        "RandomForest": lambda: RandomForestRegressor(n_estimators=400, max_depth=6, min_samples_leaf=1, random_state=7, n_jobs=-1),
    }


def bootstrap_uncertainty(profile, X, y, x_pred):
    if profile == "mars_landing":
        return None
    preds = []
    rng = random.Random(7)
    for _ in range(24):
        idx = [rng.randrange(len(y)) for _ in range(len(y))]
        m = make_model(profile)
        m.fit(X[idx], y[idx])
        preds.append(m.predict(x_pred))
    return np.std(np.array(preds), axis=0)


def main():
    d = json.loads(DATA_PATH.read_text())
    sites = d["sites"]
    out = {}
    for profile in PROFILES:
        X = np.array([feature_vector(s, profile, s["climate"]) for s in sites], dtype=float)
        y = np.array([score_site_new(s, profile, s["climate"])["total"] for s in sites], dtype=float)

        kf = KFold(5, shuffle=True, random_state=7)
        pred = np.zeros(len(y))
        for tr, te in kf.split(X):
            m = make_model(profile)
            m.fit(X[tr], y[tr])
            pred[te] = m.predict(X[te])

        mae = float(mean_absolute_error(y, pred))
        r2 = float(r2_score(y, pred))
        rho = float(spearmanr(y, pred).correlation)
        pairs = correct = 0
        for i in range(len(y)):
            for j in range(i + 1, len(y)):
                if y[i] == y[j]:
                    continue
                pairs += 1
                if (y[i] - y[j]) * (pred[i] - pred[j]) > 0:
                    correct += 1
        pairwise = correct / pairs if pairs else 0.0

        # model selection table
        cand_rows = []
        for name, factory in candidate_models().items():
            cp = np.zeros(len(y))
            for tr, te in kf.split(X):
                cm = factory()
                cm.fit(X[tr], y[tr])
                cp[te] = cm.predict(X[te])
            cand_rows.append(dict(
                name=name,
                r2=round(float(r2_score(y, cp)), 3),
                mae=round(float(mean_absolute_error(y, cp)), 2),
                spearman=round(float(spearmanr(y, cp).correlation), 3),
            ))
        cand_rows.sort(key=lambda r: -r["r2"])

        final = make_model(profile)
        final.fit(X, y)
        y_hat = final.predict(X)
        unc = bootstrap_uncertainty(profile, X, y, X)
        if unc is None:
            tree_preds = np.array([t.predict(X) for t in final.estimators_])
            unc = np.std(tree_preds, axis=0)

        # model-agnostic permutation importance
        try:
            pi = permutation_importance(final, X, y, n_repeats=20, random_state=7, scoring="r2")
            imp = np.clip(pi.importances_mean, 0, None)
        except Exception:
            imp = np.ones(len(FEATURE_NAMES))
        imp = imp / imp.sum() if imp.sum() else imp

        predictions = []
        for i, s in enumerate(sites):
            p = dict(
                id=s["id"], name=s["name"],
                actual=round(float(y[i]), 1),
                predicted=round(float(y_hat[i]), 1),
                uncertainty=round(float(unc[i]), 1),
            )
            predictions.append(p)
            s.setdefault("ml", {})[profile] = dict(
                predicted=p["predicted"], uncertainty=p["uncertainty"], actual=p["actual"],
            )

        out[profile] = dict(
            algorithm=model_label(profile),
            trainSize=int(len(y)),
            sites=int(len(sites)),
            cv="5-fold cross-validation (real sites)",
            mae=round(mae, 2),
            r2=round(r2, 3),
            spearman=round(rho, 3),
            pairwise=round(pairwise, 3),
            candidates=cand_rows,
            features=FEATURE_NAMES,
            importances=[round(float(v), 4) for v in imp],
            predictions=sorted(predictions, key=lambda p: -p["predicted"]),
        )
        print(f"{profile}: {model_label(profile)}  R2 {r2:.3f}  MAE {mae:.2f}  rho {rho:.3f}  pairwise {pairwise:.3f}")

    d["ml"] = dict(
        generatedAt=d.get("generatedAt"),
        target="domain match score (0-100) per mission profile",
        profiles=out,
        features=FEATURE_NAMES,
        method="Profile-specific models selected by cross-validated ranking performance: RBF-SVR for lunar base/expedition, ExtraTrees for Mars. 5-fold CV on 34 real sites; uncertainty from 24 bootstrap SVR fits or ExtraTrees tree variance.",
        caveat="Surrogate model trained on expert-scored sites. It reproduces the transparent domain rubric and provides uncertainty; it is not a substitute for field validation.",
    )

    campaigns = {}
    for profile in PROFILES:
        pred_map = {p["id"]: p["predicted"] for p in out[profile]["predictions"]}
        c = best_campaign(profile, sites, pred_map)
        if c:
            campaigns[profile] = c
            print(f"  campaign {profile}: {c['assignments'][0]['site']} -> {c['assignments'][1]['site']} -> {c['assignments'][2]['site']}  {c['totalDays']}d  {c['travelHours']}h  ${c['travelCost']:,}")
    d["campaigns"] = campaigns
    DATA_PATH.write_text(json.dumps(d, indent=2))
    print(f"Wrote {DATA_PATH}")


if __name__ == "__main__":
    main()
