
from itertools import combinations, product


def apply_score(criterion, y, pa):
    y_node = criterion.variables[y]
    pa_nodes = tuple(criterion.variables[e] for e in pa)
    return criterion.local_score(y_node, pa_nodes)


def subset_generator(s):
    """
    a generator to generate all subset of s, also contains Ø.

    Parameters
    ----------
    s: iterable
        a set of nodes
    """

    for i in range(len(s) + 1):
        if i == 0:
            yield set()
        else:
            for each in combinations(s, i):
                yield set(each)


def cartesian_combination(arr):
    """
    Return cartesian product combination of arr

    this method be used in module `ges.score.local_scores.BDeuScore`

    Parameters
    ----------
    arr: list
        list of iterable

    Returns
    -------
    out: list
        list of list
    """

    return [list(x) for x in product(*arr)]