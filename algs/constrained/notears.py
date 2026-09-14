"""Constrained NOTEARS: enforce a hard edge constraint via L-BFGS-B bounds.

gcastle's :class:`Notears` has no public constraint hook, but its
``notears_linear`` already builds per-entry bounds
``(0, 0) if i == j else (0, None)`` for the doubled variables.  Setting ``(0, 0)``
on a forbidden ``(i, j)`` entry is an *exact* hard constraint, so this subclass
just reproduces that optimisation with the extra bounds.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import scipy.optimize as sopt
from scipy.special import expit as sigmoid

from castle.algorithms.gradient.notears.linear import Notears
from castle.common import Tensor


class ConstrainedNotears(Notears):
    """NOTEARS with a hard edge constraint.

    ``mask`` is an ``(d, d)`` 0/1 matrix; ``mask[i, j] == 0`` forces ``W[i, j]``
    to zero exactly by fixing the bounds of the corresponding ``w_pos`` / ``w_neg``
    variables to ``(0, 0)``.
    """

    def __init__(self, mask: Optional[np.ndarray] = None, **kwargs):
        super().__init__(**kwargs)
        self.mask = None if mask is None else np.asarray(mask)

    def learn(self, data, columns=None, mask: Optional[np.ndarray] = None, **kwargs):
        if mask is not None:
            self.mask = np.asarray(mask)

        X = Tensor(data, columns=columns)
        W_est = self.notears_linear(
            X, lambda1=self.lambda1, loss_type=self.loss_type,
            max_iter=self.max_iter, h_tol=self.h_tol, rho_max=self.rho_max,
            mask=self.mask,
        )
        causal_matrix = (abs(W_est) > self.w_threshold).astype(int)
        self.weight_causal_matrix = Tensor(W_est, index=X.columns, columns=X.columns)
        self.causal_matrix = Tensor(causal_matrix, index=X.columns, columns=X.columns)

    def notears_linear(self, X, lambda1, loss_type, max_iter, h_tol, rho_max,
                       mask: Optional[np.ndarray] = None):
        """Copy of the parent optimisation, with hard bounds on forbidden entries."""
        d = X.shape[1]

        def _loss(W):
            """Evaluate value and gradient of loss."""
            M = X @ W
            if loss_type == 'l2':
                R = X - M
                loss = 0.5 / X.shape[0] * (R ** 2).sum()
                G_loss = - 1.0 / X.shape[0] * X.T @ R
            elif loss_type == 'logistic':
                loss = 1.0 / X.shape[0] * (np.logaddexp(0, M) - X * M).sum()
                G_loss = 1.0 / X.shape[0] * X.T @ (sigmoid(M) - X)
            elif loss_type == 'poisson':
                S = np.exp(M)
                loss = 1.0 / X.shape[0] * (S - X * M).sum()
                G_loss = 1.0 / X.shape[0] * X.T @ (S - X)
            else:
                raise ValueError('unknown loss type')
            return loss, G_loss

        def _h(W):
            M = np.eye(d) + W * W / d  # (Yu et al. 2019)
            E = np.linalg.matrix_power(M, d - 1)
            h = (E.T * M).sum() - d
            G_h = E.T * W * 2
            return h, G_h

        def _adj(w):
            return (w[:d * d] - w[d * d:]).reshape([d, d])

        def _func(w):
            W = _adj(w)
            loss, G_loss = _loss(W)
            h, G_h = _h(W)
            obj = loss + 0.5 * rho * h * h + alpha * h + lambda1 * w.sum()
            G_smooth = G_loss + (rho * h + alpha) * G_h
            g_obj = np.concatenate((G_smooth + lambda1, - G_smooth + lambda1),
                                   axis=None)
            return obj, g_obj

        n, d = X.shape
        w_est, rho, alpha, h = np.zeros(2 * d * d), 1.0, 0.0, np.inf
        bnds = []
        for _ in range(2):
            for i in range(d):
                for j in range(d):
                    if i == j or (mask is not None and mask[i, j] == 0):
                        bnds.append((0, 0))
                    else:
                        bnds.append((0, None))
        if loss_type == 'l2':
            X = X - np.mean(X, axis=0, keepdims=True)

        logging.info('[start]: n={}, d={}, iter_={}, h_={}, rho_={}'.format(
            n, d, max_iter, h_tol, rho_max))

        for i in range(max_iter):
            w_new, h_new = None, None
            while rho < rho_max:
                sol = sopt.minimize(_func, w_est, method='L-BFGS-B',
                                    jac=True, bounds=bnds)
                w_new = sol.x
                h_new, _ = _h(_adj(w_new))

                logging.info(
                    '[iter {}] h={:.3e}, loss={:.3f}, rho={:.1e}'.format(
                        i, h_new, _func(w_est)[0], rho))

                if h_new > 0.25 * h:
                    rho *= 10
                else:
                    break
            w_est, h = w_new, h_new
            alpha += rho * h

            if h <= h_tol or rho >= rho_max:
                break

        W_est = _adj(w_est)
        logging.info('FINISHED')
        return W_est
