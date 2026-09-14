"""Export -> import -> export, through the real HTTP routes.

`tests/test_bundle.py` covers `service/api/bundle.py` in isolation, on the
argument that its failure modes are all "is this file what it claims to be"
and need no server. That left one gap it could not see: the *export* half
lives in `service/api/main.py`, and the two halves only meet over HTTP.

The bug that motivated this file is exactly in that seam. An imported project
deliberately has no source KG (W29 — the KG is not in the bundle), so
`p.schema` is None; `_render(p, "schema", ...)` dereferenced it anyway, and
because the `what=project` loop skips an artifact only on `HTTPException`, the
resulting AttributeError escaped as a 500 and took the whole archive with it.
An exported project could therefore be imported but never exported again, so a
session could survive exactly one restart. The round trip is the property worth
asserting, not any one of its halves.

These tests use FastAPI's `TestClient` rather than a live uvicorn: the routes
under test are synchronous and in-process, and `PROJECTS` is a module-level
dict either way. No dowhy/pgmpy import is triggered — nothing here fits a
model, which is the point (a source-less project is the awkward case).
"""

from __future__ import annotations

import io
import zipfile

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient  # noqa: E402

from service.api.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project_with_source(client) -> str:
    pid = client.post("/api/projects", json={"name": "roundtrip"}).json()["id"]
    r = client.post(f"/api/projects/{pid}/sources/sample",
                    json={"sample_id": "synthetic_clinic"})
    assert r.status_code == 200, r.text
    return pid


def _export_zip(client, pid: str) -> zipfile.ZipFile:
    r = client.get(f"/api/projects/{pid}/export",
                   params={"what": "project", "format": "zip"})
    assert r.status_code == 200, f"export failed: {r.status_code} {r.text[:400]}"
    return zipfile.ZipFile(io.BytesIO(r.content))


def _import_zip(client, blob: bytes) -> str:
    r = client.post("/api/projects/import",
                    files={"file": ("project.zip", blob, "application/zip")})
    assert r.status_code == 200, f"import failed: {r.status_code} {r.text[:400]}"
    return r.json()["id"]


def test_a_project_with_a_source_exports_its_schema(client):
    with _export_zip(client, _new_project_with_source(client)) as z:
        assert "project.json" in z.namelist()
        assert "schema.json" in z.namelist()
        assert "ERRORS.txt" not in z.namelist()


def test_an_imported_project_can_be_exported_again(client):
    """The round trip. This is the one that used to 500."""
    pid = _new_project_with_source(client)
    r = client.get(f"/api/projects/{pid}/export",
                   params={"what": "project", "format": "zip"})
    assert r.status_code == 200, r.text
    blob = r.content
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names_before = set(z.namelist())

    imported = _import_zip(client, blob)
    with _export_zip(client, imported) as z:
        names_after = set(z.namelist())

    assert "project.json" in names_after
    # The schema is derived from the KG, and the KG is not in a bundle, so it is
    # *absent* on the second lap rather than present-and-empty or fatal.
    assert "schema.json" in names_before
    assert "schema.json" not in names_after
    # Nothing fell over on the way: ERRORS.txt only appears for an artifact that
    # raised something other than "not produced yet".
    assert "ERRORS.txt" not in names_after


def test_the_round_trip_is_repeatable(client):
    """Import -> export -> import again. A session has to survive more than one restart."""
    pid = _new_project_with_source(client)
    first = client.get(f"/api/projects/{pid}/export",
                       params={"what": "project", "format": "zip"}).content

    once = _import_zip(client, first)
    second = client.get(f"/api/projects/{once}/export",
                        params={"what": "project", "format": "zip"})
    assert second.status_code == 200, second.text
    twice = _import_zip(client, second.content)

    assert twice != once
    # The curated selection is what `project.json` carries, and it has to still
    # be there after two laps — that is what makes the archive durable rather
    # than merely re-readable.
    with zipfile.ZipFile(io.BytesIO(second.content)) as z:
        import json
        project = json.loads(z.read("project.json"))
    # `restore_into` keeps the exported name in preference to the placeholder the
    # import route creates the project under, so the name survives both laps.
    assert project["name"] == "roundtrip"
    assert "selected_edges" in project and "manual_edges" in project


def test_an_absent_schema_is_a_400_not_a_500(client):
    """The direct artifact URL, not just the zip: `?what=schema` is still reachable."""
    pid = _new_project_with_source(client)
    blob = client.get(f"/api/projects/{pid}/export",
                      params={"what": "project", "format": "zip"}).content
    imported = _import_zip(client, blob)

    r = client.get(f"/api/projects/{imported}/export", params={"what": "schema"})
    assert r.status_code == 400
    assert "source" in r.json()["detail"].lower()


def test_one_unrenderable_artifact_does_not_lose_the_archive(client, monkeypatch):
    """The guard behind the guard.

    Fixing `_schema_payload` fixes the bug that was found; the loop catching
    only `HTTPException` is what turned it into a lost export, and the next
    artifact to grow a bug like it should cost the user that artifact, not the
    session. Simulated by breaking one renderer on purpose.
    """
    from service.api import main as api

    pid = _new_project_with_source(client)
    real = api._render

    def flaky(p, what, fmt, select=None):
        if what == "nodes":
            raise RuntimeError("boom")
        return real(p, what, fmt, select)

    monkeypatch.setattr(api, "_render", flaky)
    with _export_zip(client, pid) as z:
        names = set(z.namelist())
        errors = z.read("ERRORS.txt").decode() if "ERRORS.txt" in names else ""

    assert "nodes.csv" not in names
    assert "project.json" in names and "schema.json" in names
    assert "ERRORS.txt" in names
    assert "nodes.csv" in errors and "boom" in errors
