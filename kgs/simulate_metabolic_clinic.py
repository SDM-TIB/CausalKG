"""Simulate a mixed-type (categorical + numerical) metabolic-clinic cohort CSV.

This is the data side of the RML -> rdfizer -> CausalKG_api pipeline: unlike
``synthetic_clinic.ttl`` (all categorical) and ``VSC.ttl`` (all numerical),
this dataset deliberately mixes both literal kinds so that one KG exercises

* causal discovery on mixed columns (categorical edges via the discrete frame,
  numerical edges via the continuous frame), and
* causal inference across kinds (numerical causes -> categorical outcomes and
  vice versa, e.g. ``do(BMI)`` on ``Diabetes``).

The generator is a structural causal model in its own right, so the CSV comes
with a known ground-truth DAG (n=10 nodes, 16 edges), listed below for
reference when judging discovery output::

    AgeGroup      -> ActivityLevel, BMI, FastingGlucose, SystolicBP   (cat)
    Sex           -> ActivityLevel, BMI                              (cat)
    Smoker        -> BMI, SystolicBP, Cholesterol                     (cat)
    ActivityLevel -> BMI                                             (cat)
    BMI           -> FastingGlucose, SystolicBP, Cholesterol, Diabetes (num)
    FastingGlucose-> Diabetes                                        (num)
    SystolicBP    -> Hypertension                                    (num)

Exogenous: AgeGroup, Sex, Smoker.  Edge kinds cover cat->cat, cat->num,
num->num, and num->cat, i.e. every mixed-type combination the pipeline claims
to support.  Mechanisms are logistic/threshold where the child is categorical
(so no deterministic cut is recoverable from the data alone) and linear +
Gaussian noise where the child is numerical.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

N_ROWS = 1000
SEED = 20260908
OUT_PATH = Path(__file__).resolve().parent / "csvs" / "metabolic_clinic.csv"

AGE = ["YOUNG", "MIDDLE", "OLDER"]
SEX = ["Female", "Male"]
SMOKER = ["Never", "Former", "Current"]
ACTIVITY = ["Sedentary", "Moderate", "Vigorous"]
HYPER = ["No", "Yes"]
DIAB = ["No", "Prediabetes", "Diabetes"]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def simulate(n: int = N_ROWS, seed: int = SEED) -> list[dict]:
    rng = np.random.default_rng(seed)

    age = rng.choice([0, 1, 2], size=n, p=[0.30, 0.45, 0.25])
    sex = rng.choice([0, 1], size=n, p=[0.51, 0.49])
    smoker = rng.choice([0, 1, 2], size=n, p=[0.55, 0.25, 0.20])

    # AgeGroup, Sex -> ActivityLevel (ordinal thresholds keep it categorical)
    act_score = 1.6 - 0.85 * age + 0.35 * sex + rng.normal(0, 0.75, n)
    activity = np.digitize(act_score, [0.0, 1.4])

    # AgeGroup, Sex, Smoker, ActivityLevel -> BMI
    bmi = (
        23.5
        + 1.7 * age
        + 0.7 * sex
        - 1.5 * activity
        + 0.8 * smoker
        + rng.normal(0, 1.6, n)
    )
    bmi = np.clip(bmi, 16.0, 45.0)

    # AgeGroup, BMI -> FastingGlucose
    glucose = 86.0 + 3.2 * age + 1.1 * (bmi - 25.0) + rng.normal(0, 6.5, n)

    # AgeGroup, BMI, Smoker -> SystolicBP
    sbp = 113.0 + 5.2 * age + 0.8 * (bmi - 25.0) + 1.8 * smoker + rng.normal(0, 6.8, n)

    # AgeGroup, BMI, Smoker -> Cholesterol
    chol = (
        172.0 + 5.5 * age + 1.0 * (bmi - 25.0) + 7.5 * smoker + rng.normal(0, 14.0, n)
    )

    # SystolicBP, AgeGroup -> Hypertension (logistic, stays stochastic)
    ht_logit = 0.0 + 0.22 * (sbp - 125.0) + 0.10 * age
    hypertension = (rng.uniform(size=n) < _sigmoid(ht_logit)).astype(int)

    # BMI, FastingGlucose -> Diabetes (noisy ordinal thresholds)
    diab_score = 0.055 * (glucose - 100.0) + 0.09 * (bmi - 25.0) + rng.normal(0, 1.0, n)
    diabetes = np.digitize(diab_score, [-0.45, 0.75])

    rows = []
    for i in range(n):
        rows.append(
            {
                "index": i,
                "AgeGroup": AGE[age[i]],
                "Sex": SEX[sex[i]],
                "Smoker": SMOKER[smoker[i]],
                "ActivityLevel": ACTIVITY[activity[i]],
                "BMI": f"{bmi[i]:.2f}",
                "FastingGlucose": f"{glucose[i]:.1f}",
                "SystolicBP": f"{sbp[i]:.1f}",
                "Cholesterol": f"{chol[i]:.1f}",
                "Hypertension": HYPER[hypertension[i]],
                "Diabetes": DIAB[diabetes[i]],
            }
        )
    return rows


def main() -> None:
    rows = simulate()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    # Quick sanity report so miscalibration is visible at generation time.
    import collections

    for col in ("ActivityLevel", "Hypertension", "Diabetes"):
        counts = collections.Counter(r[col] for r in rows)
        print(col, dict(counts))
    nums = {
        c: [float(r[c]) for r in rows]
        for c in ("BMI", "FastingGlucose", "SystolicBP", "Cholesterol")
    }
    for c, vals in nums.items():
        arr = np.asarray(vals)
        print(
            f"{c}: mean={arr.mean():.2f} sd={arr.std():.2f} "
            f"min={arr.min():.2f} max={arr.max():.2f}"
        )
    print(f"wrote {len(rows)} rows -> {OUT_PATH}")


if __name__ == "__main__":
    main()
