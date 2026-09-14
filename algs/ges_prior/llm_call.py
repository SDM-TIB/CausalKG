"""
Minimal unified LLM client for OpenAI-compatible and Anthropic-compatible APIs.

You supply model / api_key / base_url. The client only decides which SDK to
speak (openai vs anthropic) and translates the few parameters that differ.

    from llm_client import LLMClient

    LLMClient("deepseek-chat", base_url="deepseek").query("hi")
    LLMClient("kimi-k2-0905-preview", base_url="kimi").query("hi")
    LLMClient("glm-4.6", base_url="glm").query("hi")
    LLMClient("claude-sonnet-4-5").query("hi", system="Be terse.")
    LLMClient("qwen-max", base_url="https://my-proxy/v1", api_key="sk-...")

base_url accepts a full URL or a shortcut name from BASE_URLS.
If base_url is omitted, the shortcut is also guessed from the model name
(e.g. "deepseek-v4-flash-vision-exp" -> "deepseek").
api_key defaults to {SHORTCUT}_API_KEY, then {SHORTCUT}_KEY / {SHORTCUT}_TOKEN,
then OPENAI_API_KEY / ANTHROPIC_API_KEY / LLM_API_KEY, then a fuzzy scan of
all env vars whose name contains the shortcut's stem and ends in KEY/TOKEN
(so a local .env using DEEPSEEK_KEY or KIMI_KEY instead of the *_API_KEY
convention is still picked up).

Install: pip install openai anthropic python-dotenv
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Sequence, Union

try:
    from dotenv import find_dotenv, load_dotenv

    # find_dotenv(usecwd=True) only walks *upward* from the process's cwd.
    # That misses a .env living in a subdirectory of the project (e.g.
    # algs/.env) whenever the caller's cwd is the repo root or elsewhere
    # (common from Jupyter, where cwd often isn't this file's directory).
    # So also walk upward from this file's own location, where dotenv's
    # default (non-usecwd) frame-based search would look if called
    # directly from here.
    _here = os.path.dirname(os.path.abspath(__file__))
    _d = _here
    for _ in range(8):
        _candidate = os.path.join(_d, ".env")
        if os.path.isfile(_candidate):
            load_dotenv(_candidate, override=False)
            break
        _parent = os.path.dirname(_d)
        if _parent == _d:
            break
        _d = _parent

    # Also try the usual cwd-based lookup, for the common case where the
    # script/notebook's cwd is at or below the project root.
    load_dotenv(find_dotenv(usecwd=True), override=False)
except Exception:
    pass

# Convenience only — pass any full URL instead.
# The API key env var is derived from the part before the first "_",
# e.g. "mimo_anthropic" -> MIMO_API_KEY.
BASE_URLS: Dict[str, str] = {
    # --- OpenAI-compatible ---
    "mimo": "https://api.xiaomimimo.com/v1",
    "deepseek": "https://api.deepseek.com",
    "kimi": "https://api.moonshot.cn/v1",
    "kimi_intl": "https://api.moonshot.ai/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "glm_intl": "https://api.z.ai/api/paas/v4",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "openrouter": "https://openrouter.ai/api/v1",
    "xai": "https://api.x.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "ollama": "http://localhost:11434/v1",
    "vllm": "http://localhost:8000/v1",
    # --- Anthropic-compatible (api= inferred from the "anthropic" in the URL) ---
    "mimo_anthropic": "https://api.xiaomimimo.com/anthropic",
    "deepseek_anthropic": "https://api.deepseek.com/anthropic",
    "kimi_anthropic": "https://api.moonshot.cn/anthropic",
    "glm_anthropic": "https://open.bigmodel.cn/api/anthropic",
    "glm_intl_anthropic": "https://api.z.ai/api/anthropic",
}

# When base_url is omitted, guess a BASE_URLS shortcut from a substring of
# the model name itself, e.g. "deepseek-v4-flash-vision-exp" -> "deepseek",
# "kimi-k2-0905-preview" -> "kimi". Only used when base_url is not given.
MODEL_PROVIDER_HINTS: Dict[str, str] = {
    "deepseek": "deepseek",
    "kimi": "kimi",
    "moonshot": "kimi",
    "glm": "glm",
    "qwen": "qwen",
    "gemini": "gemini",
    "mimo": "mimo",
    "grok": "xai",
}

Messages = Union[str, Sequence[Dict[str, Any]]]


@dataclass
class LLMResponse:
    text: str
    reasoning: Optional[str] = None
    finish_reason: Optional[str] = None
    usage: Dict[str, Any] = field(default_factory=dict)
    raw: Any = None

    def __str__(self) -> str:
        return self.text


class LLMClient:
    """
    model       : model id
    api_key     : explicit key, else env lookup
    base_url    : full URL or BASE_URLS shortcut; None = SDK default
    api         : "openai" | "anthropic"; inferred from base_url/model if omitted
    **kwargs    : forwarded to the SDK constructor (proxies, default_headers, ...)

    Call defaults (override per call): temperature=0.0, top_p=1.0,
    max_tokens=20000, thinking=False.
    """

    def __init__(
        self,
        model: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        api: Optional[str] = None,
        *,
        system: Optional[str] = None,
        temperature: float = 0.0,
        top_p: float = 1.0,
        max_tokens: int = 20000,
        thinking: Union[bool, int, str] = False,
        timeout: float = 120.0,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> None:
        self.model = model
        shortcut = base_url if base_url in BASE_URLS else None
        if shortcut is None and base_url is None:
            shortcut = self._infer_shortcut(model, api)
            if shortcut:
                base_url = shortcut
        self.base_url = BASE_URLS.get(base_url, base_url)
        self.api = (api or self._infer_api(self.base_url, model)).lower()
        self.api_key = api_key or self._env_key(shortcut)
        self.system = system
        self.temperature, self.top_p = temperature, top_p
        self.max_tokens, self.thinking = max_tokens, thinking

        opts = dict(api_key=self.api_key, timeout=timeout,
                    max_retries=max_retries, **kwargs)
        if self.base_url:
            opts["base_url"] = self.base_url

        if self.api == "anthropic":
            import inspect

            import anthropic

            self.client = anthropic.Anthropic(**opts)
            # anthropic SDK >= 1.0 dropped temperature/top_p from messages.create
            self._sdk_sampling = "temperature" in inspect.signature(
                self.client.messages.create).parameters
        else:
            from openai import OpenAI

            self.client = OpenAI(**opts)

    @staticmethod
    def _infer_api(base_url: Optional[str], model: str) -> str:
        if base_url and "anthropic" in base_url:
            return "anthropic"
        if not base_url and model.lower().startswith("claude"):
            return "anthropic"
        return "openai"

    @staticmethod
    def _infer_shortcut(model: str, api: Optional[str]) -> Optional[str]:
        """Guess a BASE_URLS shortcut from the model name when base_url is
        omitted, e.g. LLMClient("deepseek-v4-flash-vision-exp") -> "deepseek"."""
        m = model.lower()
        for name, shortcut in MODEL_PROVIDER_HINTS.items():
            if name in m:
                if api == "anthropic":
                    anth = f"{shortcut}_anthropic"
                    if anth in BASE_URLS:
                        return anth
                return shortcut
        return None

    def _env_key(self, shortcut: Optional[str]) -> Optional[str]:
        stem = shortcut.split("_")[0].upper() if shortcut else None
        names: List[str] = []
        if stem:
            names += [f"{stem}_API_KEY", f"{stem}_KEY", f"{stem}_TOKEN"]
        names += [
            "ANTHROPIC_API_KEY" if self.api == "anthropic" else "OPENAI_API_KEY",
            "LLM_API_KEY",
        ]
        for n in names:
            v = os.getenv(n)
            if v:
                return v
        # Fuzzy fallback: a local .env may not follow the *_API_KEY
        # convention (e.g. DEEPSEEK_KEY, KIMI_KEY). Match any env var whose
        # "_"-separated name contains the provider stem as a whole token and
        # ends in KEY/TOKEN.
        if stem:
            for env_name, val in os.environ.items():
                if not val:
                    continue
                upper = env_name.upper()
                if stem in upper.split("_") and upper.endswith(("KEY", "TOKEN")):
                    return val
        return "EMPTY" if self.base_url else None  # local servers ignore the key

    # ------------------------------------------------------------------ #
    def query_response(self, prompt: Messages, **kw: Any) -> str:
        """Text only."""
        return self.complete(prompt, **kw).text

    def complete(self, prompt: Messages, **kw: Any) -> LLMResponse:
        """Text + reasoning + usage + raw response."""
        params = self._params(prompt, **kw)
        if self.api == "anthropic":
            return self._parse_anthropic(self.client.messages.create(**params))
        return self._parse_openai(self.client.chat.completions.create(**params))

    def stream(self, prompt: Messages, **kw: Any) -> Iterator[str]:
        """Yield text deltas."""
        params = self._params(prompt, **kw)
        if self.api == "anthropic":
            with self.client.messages.stream(**params) as s:
                yield from s.text_stream
        else:
            params["stream"] = True
            for chunk in self.client.chat.completions.create(**params):
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

    # ------------------------------------------------------------------ #
    def _params(
        self,
        prompt: Messages,
        *,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        thinking: Union[bool, int, str, None] = None,
        stop: Optional[Sequence[str]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        **kw: Any,
    ) -> Dict[str, Any]:
        msgs: List[Dict[str, Any]] = (
            [{"role": "user", "content": prompt}] if isinstance(prompt, str)
            else [dict(m) for m in prompt]
        )
        system = system if system is not None else self.system
        temperature = self.temperature if temperature is None else temperature
        top_p = self.top_p if top_p is None else top_p
        thinking = self.thinking if thinking is None else thinking
        max_tokens = max_tokens or self.max_tokens
        p: Dict[str, Any] = {"model": self.model, "max_tokens": max_tokens, **kw}

        if self.api == "anthropic":
            sys_msgs = [m["content"] for m in msgs if m.get("role") == "system"]
            p["messages"] = [m for m in msgs if m.get("role") != "system"]
            if system or sys_msgs:
                p["system"] = "\n\n".join(([system] if system else []) + sys_msgs)
            body = dict(extra_body or {})
            if thinking:
                budget = thinking if isinstance(thinking, int) and not isinstance(thinking, bool) else 2048
                p["max_tokens"] = max(max_tokens, budget + 1024)
                p["thinking"] = {"type": "enabled", "budget_tokens": budget}
                # temperature/top_p must not be set alongside extended thinking
            else:
                if thinking is False:
                    p["thinking"] = {"type": "disabled"}
                sampling = {"temperature": temperature, "top_p": top_p}
                if self._sdk_sampling:
                    p.update(sampling)
                elif self.base_url:  # SDK 1.x dropped them; compat endpoints take them
                    body = {**sampling, **body}
            if stop:
                p["stop_sequences"] = list(stop)
            if body:
                p["extra_body"] = body
            return p

        # OpenAI-compatible
        if system:
            msgs = [{"role": "system", "content": system}] + [
                m for m in msgs if m.get("role") != "system"
            ]
        p["messages"] = msgs
        p["temperature"], p["top_p"] = temperature, top_p
        if stop:
            p["stop"] = list(stop)
        if self.model.lower().startswith(("o1", "o3", "o4", "gpt-5")):
            p["max_completion_tokens"] = p.pop("max_tokens")
            p.pop("temperature", None)  # unsupported by OpenAI reasoning models
            p.pop("top_p", None)
            if thinking:  # "minimal" | "low" | "medium" | "high"
                p["reasoning_effort"] = thinking if isinstance(thinking, str) else "medium"
        elif self.base_url:  # DeepSeek / MiMo / GLM / Qwen toggle (not on api.openai.com)
            extra_body = {"thinking": {"type": "enabled" if thinking else "disabled"},
                          **(extra_body or {})}
        if extra_body:
            p["extra_body"] = extra_body
        return p

    @staticmethod
    def _parse_anthropic(r: Any) -> LLMResponse:
        text = "".join(b.text for b in r.content if b.type == "text")
        think = "".join(b.thinking for b in r.content if b.type == "thinking")
        return LLMResponse(text, think or None, r.stop_reason,
                           {"input": r.usage.input_tokens,
                            "output": r.usage.output_tokens}, r)

    @staticmethod
    def _parse_openai(r: Any) -> LLMResponse:
        m = r.choices[0].message
        u = r.usage
        return LLMResponse(m.content or "",
                           getattr(m, "reasoning_content", None),
                           r.choices[0].finish_reason,
                           {"input": u.prompt_tokens, "output": u.completion_tokens} if u else {},
                           r)

    def __repr__(self) -> str:
        return f"LLMClient({self.model!r}, api={self.api!r}, base_url={self.base_url!r})"