"""
LLM provider abstraction layer.

Each provider implements the LLMAdapter protocol: a single `stream` method
that yields raw text chunks. The active adapter is selected at runtime via
the LLM_PROVIDER env var (default: anthropic).

Supported providers: anthropic, openai, groq, gemini, cursor, openai_compatible.

"cursor" and "openai_compatible" both use the OpenAI SDK with a custom base URL.
This means any OpenAI-compatible endpoint (Ollama, Together, Fireworks, etc.)
works without a dedicated adapter -- set LLM_PROVIDER=openai_compatible and
point OPENAI_COMPATIBLE_BASE_URL at your endpoint.

Future: if the number of supported providers grows significantly, replacing
this with LiteLLM (https://github.com/BerriAI/litellm) is worth considering.
LiteLLM provides a unified OpenAI-compatible interface over 100+ providers
and handles streaming, retries, and fallbacks. The tradeoff is a heavier
dependency and less transparency -- the adapter pattern here is preferred
while the provider list stays small.
"""

import os
from typing import Generator, Protocol


# -- Protocol --

class LLMAdapter(Protocol):
    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        """Yield raw text chunks for the given prompt."""
        ...


# -- Anthropic --

class AnthropicAdapter:
    DEFAULT_MODEL = "claude-haiku-4-5-20251001"

    def __init__(self):
        import anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = os.getenv("ANTHROPIC_MODEL", self.DEFAULT_MODEL)

    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        with self._client.messages.stream(
            model=self._model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        ) as s:
            for chunk in s.text_stream:
                yield chunk


# -- OpenAI --

class OpenAIAdapter:
    DEFAULT_MODEL = "gpt-4o-mini"

    def __init__(self):
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        self._client = OpenAI(api_key=api_key)
        self._model = os.getenv("OPENAI_MODEL", self.DEFAULT_MODEL)

    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            messages=[{"role": "user", "content": prompt}],
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# -- Groq --

class GroqAdapter:
    DEFAULT_MODEL = "llama3-8b-8192"

    def __init__(self):
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set")
        self._client = Groq(api_key=api_key)
        self._model = os.getenv("GROQ_MODEL", self.DEFAULT_MODEL)

    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            messages=[{"role": "user", "content": prompt}],
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# -- Gemini --

class GeminiAdapter:
    DEFAULT_MODEL = "gemini-1.5-flash"

    def __init__(self):
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(
            os.getenv("GEMINI_MODEL", self.DEFAULT_MODEL)
        )

    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        response = self._model.generate_content(
            prompt,
            stream=True,
            generation_config={"max_output_tokens": max_tokens},
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text


# -- OpenAI-compatible base (Cursor, Ollama, Together, Fireworks, etc.) --

class OpenAICompatibleAdapter:
    """
    Generic adapter for any OpenAI-compatible endpoint.
    Requires:
      OPENAI_COMPATIBLE_BASE_URL  -- e.g. https://api.cursor.sh/v1
      OPENAI_COMPATIBLE_API_KEY   -- API key for the endpoint
      OPENAI_COMPATIBLE_MODEL     -- model name the endpoint expects
    """
    def __init__(self):
        from openai import OpenAI
        base_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL")
        api_key = os.getenv("OPENAI_COMPATIBLE_API_KEY")
        if not base_url:
            raise RuntimeError("OPENAI_COMPATIBLE_BASE_URL not set")
        if not api_key:
            raise RuntimeError("OPENAI_COMPATIBLE_API_KEY not set")
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = os.getenv("OPENAI_COMPATIBLE_MODEL", "default")

    def stream(self, prompt: str, max_tokens: int) -> Generator[str, None, None]:
        response = self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            messages=[{"role": "user", "content": prompt}],
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# Cursor is OpenAI-compatible -- no separate SDK needed
CursorAdapter = OpenAICompatibleAdapter


# -- Registry --

_ADAPTERS: dict[str, type] = {
    "anthropic": AnthropicAdapter,
    "openai": OpenAIAdapter,
    "groq": GroqAdapter,
    "gemini": GeminiAdapter,
    "cursor": CursorAdapter,
    "openai_compatible": OpenAICompatibleAdapter,
}

_instance: LLMAdapter | None = None


def get_llm() -> LLMAdapter:
    """
    Return the active LLM adapter singleton.
    Adapter is selected via LLM_PROVIDER env var (default: anthropic).
    Instantiated once on first call and reused.
    """
    global _instance
    if _instance is None:
        provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
        adapter_class = _ADAPTERS.get(provider)
        if not adapter_class:
            raise RuntimeError(
                f"Unknown LLM_PROVIDER '{provider}'. "
                f"Valid options: {', '.join(_ADAPTERS.keys())}"
            )
        _instance = adapter_class()
    return _instance