"""SCLC preset — the single-class, data-property-only regression dataset."""

from __future__ import annotations

import os
import sys

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import pandas as pd

from runners.run_kg_discovery import build_context, run_algorithm, run_experiment, ALL_METHODS

SCLC_TTL = os.path.join(_PROJECT_ROOT, "kgs", "ttls", "SCLC_patients.ttl")
SCLC_CSV = os.path.join(_PROJECT_ROOT, "kgs", "csvs", "SCLC_patients.csv")

# node column name -> CSV column name (from the RML mapping)
SCLC_CSV_MAPPING = {
    "SCLCPatient.ageGroup": "Age",
    "SCLCPatient.gender": "Gender",
    "SCLCPatient.smokerType": "SmokerType",
    "SCLCPatient.familyCancer": "FamilyCancer",
    "SCLCPatient.biomarker": "Biomarker",
    "SCLCPatient.episodeType": "EpisodeType",
    "SCLCPatient.relapseStatus": "Relapse",
    "SCLCPatient.locatedIn": "LocatedIn",
    "SCLCPatient.stage": "Stage",
    "SCLCPatient.familyGender": "FamilyGender",
}


def build_sclc_context():
    return build_context(SCLC_TTL)


def verify_matches_csv(ctx, csv_path: str = SCLC_CSV) -> bool:
    """Assert the SCLC flat join reproduces ``kgs/csvs/SCLC_patients.csv``."""
    mat = ctx.mat
    csv = pd.read_csv(csv_path)

    assert len(mat.df) == len(csv), f"row mismatch: {len(mat.df)} vs {len(csv)}"
    assert not ctx.dropped_columns, f"unexpected dropped columns: {ctx.dropped_columns}"

    renamed = mat.df.rename(columns=SCLC_CSV_MAPPING)
    value_cols = list(SCLC_CSV_MAPPING.values())
    expected = csv[value_cols].reset_index(drop=True).astype(str)
    actual = renamed[value_cols].reset_index(drop=True).astype(str)
    assert actual.equals(expected), "materialized frame does not match the source CSV"
    return True
