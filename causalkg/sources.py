"""Polymorphic input resolution: file path | endpoint URL | ``rdflib.Graph`` | in-memory instance.

Both Plan 2 inputs (the causal graph and the knowledge graph) accept the same
four shapes.  This module is the one place that dispatches on them, so
:mod:`causalkg.model` and the notebooks never have to.
"""

from __future__ import annotations

import os
from typing import Optional, Union

import pandas as pd
import rdflib
from rdflib import RDF
from rdflib.plugins.stores.sparqlstore import SPARQLStore

from .ontology import OntologySchema
from .vocab import CKG, GRAPH_STEM, PROV

GraphSource = Union[str, os.PathLike, rdflib.Graph]
CausalGraphSource = Union[GraphSource, "OntologicalCausalGraph"]  # noqa: F821 (forward ref, see below)

__all__ = [
    "GraphSource", "CausalGraphSource",
    "is_endpoint", "resolve_graph", "resolve_schema", "load_ocg", "list_ocgs",
]


def is_endpoint(source) -> bool:
    """True for a string that names a SPARQL endpoint rather than a file path."""
    return isinstance(source, str) and (
        source.startswith("http://") or source.startswith("https://")
    )


def resolve_graph(source: GraphSource, *, format: Optional[str] = None,
                  timeout: int = 60) -> rdflib.Graph:
    """Resolve a file path / endpoint URL / ``rdflib.Graph`` into an ``rdflib.Graph``.

    * an ``rdflib.Graph`` is returned as-is;
    * an ``http(s)://`` string is wrapped in a :class:`SPARQLStore`, so
      ``graph.query(...)`` (and therefore ``bgp.materialize``, unchanged)
      forwards to the endpoint;
    * anything else is treated as a file path and parsed, with the format
      guessed from the suffix when ``format`` is not given.
    """
    if isinstance(source, rdflib.Graph):
        return source
    if is_endpoint(source):
        store = SPARQLStore(source, returnFormat="json", timeout=timeout)
        return rdflib.Graph(store=store)
    path = os.fspath(source)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"resolve_graph: {source!r} is neither an existing file path nor an "
            "http(s):// endpoint."
        )
    g = rdflib.Graph()
    g.parse(path, format=format)
    return g


def resolve_schema(source: GraphSource, *, infer_missing: Optional[bool] = None,
                   infer_sample_limit: int = 10_000, format: Optional[str] = None,
                   timeout: int = 60) -> OntologySchema:
    """Resolve a file path / endpoint URL / ``rdflib.Graph`` into an :class:`OntologySchema`.

    ``infer_missing`` defaults to ``True`` for files (a ``SELECT ?s ?p ?o``
    A-Box scan is cheap on a KG-sized file) and ``False`` for endpoints (the
    same scan is hostile to a public SPARQL endpoint); pass it explicitly to
    override either default. A note is printed whenever the default flips.

    ``infer_sample_limit`` is accepted for forward compatibility with a
    future ``LIMIT``-bounded inference query against endpoints; the current
    :meth:`OntologySchema.from_graph` inference queries are unbounded, so
    when inference is explicitly requested against a large endpoint the
    caller is responsible for its cost.
    """
    endpoint = is_endpoint(source)
    graph = resolve_graph(source, format=format, timeout=timeout)
    if infer_missing is None:
        infer_missing = not endpoint
        if endpoint:
            print(
                "resolve_schema: infer_missing defaults to False for endpoints "
                "(pass infer_missing=True to run the T-Box inference queries "
                "against it anyway)."
            )
    return OntologySchema.from_graph(graph, infer_missing=infer_missing)


def load_ocg(source: CausalGraphSource, *, graph_id: Optional[str] = None,
            method: Optional[str] = None, format: Optional[str] = None,
            timeout: int = 60) -> "OntologicalCausalGraph":
    """Resolve any of the four causal-graph input shapes into an :class:`OntologicalCausalGraph`.

    An already-built :class:`OntologicalCausalGraph` is returned unchanged.
    Everything else is resolved to an ``rdflib.Graph`` and read with
    :meth:`OntologicalCausalGraph.from_rdf`, which raises with the candidate
    list when the graph carries more than one ``ckg:OntologicalCausalGraph``
    and neither ``graph_id`` nor ``method`` disambiguates it — see
    :func:`list_ocgs`.
    """
    from .result import OntologicalCausalGraph  # lazy: avoids a circular import

    if isinstance(source, OntologicalCausalGraph):
        return source
    graph = resolve_graph(source, format=format, timeout=timeout)
    return OntologicalCausalGraph.from_rdf(graph, graph_id=graph_id, method=method)


def list_ocgs(source: GraphSource, *, format: Optional[str] = None,
              timeout: int = 60) -> pd.DataFrame:
    """One row per ``ckg:OntologicalCausalGraph`` instance found in ``source``.

    Columns: ``gid, method, constrained, n_nodes, n_edges, created_at, iri`` —
    exactly what's needed to pick a ``graph_id=`` or ``method=`` for
    :func:`load_ocg` when a bundle (e.g. from ``write_bundle``) holds several.
    """
    graph = resolve_graph(source, format=format, timeout=timeout)
    rows = []
    for gi in graph.subjects(RDF.type, CKG.OntologicalCausalGraph):
        n_nodes = graph.value(gi, CKG.nodeCount)
        n_edges = graph.value(gi, CKG.edgeCount)
        run = graph.value(gi, PROV.wasGeneratedBy)
        created_at = graph.value(run, PROV.endedAtTime) if run is not None else None
        # Method and the constraint flag describe the run; older Turtle also
        # duplicated them onto the graph, so that copy is the fallback.
        method = graph.value(run, CKG.method) if run is not None else None
        constrained = (graph.value(run, CKG.usedTopologicalConstraint)
                       if run is not None else None)
        if method is None:
            method = graph.value(gi, CKG.method)
        if constrained is None:
            constrained = graph.value(gi, CKG.constrained)
        gid = str(gi)[len(GRAPH_STEM):] if str(gi).startswith(GRAPH_STEM) else str(gi)
        rows.append({
            "gid": gid,
            "method": str(method) if method is not None else None,
            "constrained": bool(constrained) if constrained is not None else None,
            "n_nodes": int(n_nodes) if n_nodes is not None else None,
            "n_edges": int(n_edges) if n_edges is not None else None,
            "created_at": str(created_at) if created_at is not None else None,
            "iri": str(gi),
        })
    return pd.DataFrame(
        rows, columns=["gid", "method", "constrained", "n_nodes", "n_edges", "created_at", "iri"]
    )
