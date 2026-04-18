#!/usr/bin/env python3
"""Used by git filter-branch --tree-filter to strip API keys from all revisions."""
from __future__ import annotations

import pathlib
import re


def main() -> None:
    root = pathlib.Path(".")
    env = root / ".env.example"
    if env.is_file():
        t = env.read_text(encoding="utf-8", errors="ignore")
        t = re.sub(r"^OPENAI_API_KEY=.*$", "OPENAI_API_KEY=YOUR_OPENAI_API_KEY", t, flags=re.M)
        env.write_text(t, encoding="utf-8")

    cfg = root / "ai_service" / "config" / "settings.py"
    if cfg.is_file():
        t = cfg.read_text(encoding="utf-8", errors="ignore")
        t = re.sub(
            r'(openai_api_key:\s*str\s*=\s*)("[^"]*")',
            r'\1""  # set via OPENAI_API_KEY in .env',
            t,
            count=1,
        )
        t = re.sub(
            r'(gemini_api_key:\s*str\s*=\s*)("[^"]*")',
            r'\1""  # set via GEMINI_API_KEY in .env',
            t,
            count=1,
        )
        cfg.write_text(t, encoding="utf-8")


if __name__ == "__main__":
    main()
