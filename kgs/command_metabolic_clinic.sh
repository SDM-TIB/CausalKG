#!/bin/bash
# Build kgs/ttls/metabolic_clinic.ttl end to end:
#   CSV -> rdfizer (A-Box) -> append curated T-Box -> parse check.
# Run from the repository root.  See kgs/config.ini for the all-datasets
# config; this script intentionally builds only the mixed-type dataset.
set -euo pipefail
cd "$(dirname "$0")/.."

PY=/Users/jason/miniconda3/envs/rdfenv/bin/python

"$PY" -m rdfizer -c kgs/config_metabolic_clinic.ini

cat kgs/mappings/metabolic_clinic_schema.ttl >> kgs/ttls/metabolic_clinic.ttl

"$PY" - <<'EOF'
from rdflib import Graph, RDF, OWL, Namespace
g = Graph()
g.parse("kgs/ttls/metabolic_clinic.ttl", format="turtle")
K = Namespace("http://causalkg.example.org/clinic/")
assert list(g.subjects(RDF.type, OWL.Class)), "no owl:Class in output"
patients = set(g.subjects(RDF.type, K.ClinicPatient))
assert patients, "no ClinicPatient instances"
print(f"OK: {len(g)} triples, {len(patients)} patients")
EOF
