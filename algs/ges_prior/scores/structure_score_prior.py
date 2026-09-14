"""
StructureScoreWithPrior: Generic Wrapper for Ontological Priors

Wraps any pgmpy StructureScore estimator (BIC, BDeu, K2, etc.) to incorporate 
domain knowledge through prior probabilities.
"""

# from math import log
from typing import Optional, List, Union

import numpy as np
import pandas as pd

from pgmpy.structure_score import BaseStructureScore, get_scoring_method

class StructureScoreWithPrior(BaseStructureScore):
    """
    A generic wrapper for structure scoring classes that adds an ontological 
    prior term to the score.

    This class allows you to combine any standard scoring method (e.g., BIC, BDeu, K2)
    with a prior probability matrix B.
    
    The hybrid score is computed as:
        S*(G) = S_Base(G) + λ * Σ_{(i,j)∈E(G)} log(B[i,j] / (1 - B[i,j]))

    Parameters
    ----------
    data : pandas.DataFrame
        DataFrame where each column represents a discrete variable.
        
    base_score_cls : class, default=BIC
        The class of the base scorer to use (e.g., pgmpy.estimators.BIC, 
        pgmpy.estimators.BDeu).
        
    B : numpy.ndarray, optional
        Prior probability matrix (n_vars, n_vars) where B[i,j] = P(i→j | Prior).
        Rows/Cols must match the order of columns in `data`.
        If None, uses uniform prior (neutral impact).
        
    lambda_prior : float, default=1.0
        Weight for the prior term. 
        
    epsilon : float, default=1e-6
        Numerical stability constant for log-odds calculation.
        
    **kwargs
        Additional arguments passed to the `base_score_cls` initialization 
        (e.g., `equivalent_sample_size` for BDeu).
    """
    
    def __init__(
        self,
        data: pd.DataFrame,
        base_score: Optional[Union[str, BaseStructureScore]] = None,
        B: Optional[np.ndarray] = None,
        lambda_prior: float = 1.0,
        epsilon: float = 1e-6,
        state_names=None,
    ):
        # Initialize the parent BaseStructureScore to setup state_names, variables, etc.
        super().__init__(data, state_names=state_names)

        score = get_scoring_method(base_score, data)

        # Instantiate the actual statistical scorer (Composition)
        self.base_estimator = score
        self.use_prior = True if B is not None else False 
        
        # --- Prior Initialization (Same as your draft) ---
        self.var_names = list(data.columns)
        self.n_vars = len(self.var_names)
        self.var_to_idx = {var: idx for idx, var in enumerate(self.var_names)}
        
        self.lambda_prior = lambda_prior
        self.epsilon = epsilon
        
        if B is None:
            self.B = np.full((self.n_vars, self.n_vars), 0.5)
        else:
            self._validate_B(B)
            self.B = B.copy()
            
        # Clip and precompute log-odds
        self.B = np.clip(self.B, self.epsilon, 1 - self.epsilon)
        self.log_odds_B = np.log(self.B / (1 - self.B))

    def _validate_B(self, B: np.ndarray):
        if B.shape != (self.n_vars, self.n_vars):
            raise ValueError(
                f"B must be shape ({self.n_vars}, {self.n_vars}), got {B.shape}"
            )
        if not np.all((B >= 0) & (B <= 1)):
            raise ValueError("All elements of B must be probabilities in [0, 1]")

    def local_score(self, variable: str, parents: List[str]) -> float:
        """
        Computes the local score by summing the base estimator's score 
        and the prior edge scores.
        """
        # 1. Get the statistical score from the wrapped estimator
        base_score_val = self.base_estimator.local_score(variable, parents)
        
        if not self.use_prior:
            return base_score_val
        
        # 2. Calculate the prior term
        prior_score_val = 0.0
        c_idx = self.var_to_idx[variable]
        
        for parent in parents:
            p_idx = self.var_to_idx[parent]
            prior_score_val += self.lambda_prior * self.log_odds_B[p_idx, c_idx]
            
        return base_score_val + prior_score_val

    def score(self, model):
        """
        Computes the total score of the model. 
        Overrides parent to ensure efficient summation if needed, 
        though StructureScore.score() typically calls local_score() iteratively.
        """
        score = 0
        for node in model.nodes():
            parents = list(model.predecessors(node))
            score += self.local_score(node, parents)
        return score

    # Helper methods to update priors dynamically if needed
    def set_prior_matrix(self, B: np.ndarray):
        self._validate_B(B)
        self.B = np.clip(B.copy(), self.epsilon, 1 - self.epsilon)
        self.log_odds_B = np.log(self.B / (1 - self.B))

    def set_lambda(self, lambda_prior: float):
        self.lambda_prior = lambda_prior
