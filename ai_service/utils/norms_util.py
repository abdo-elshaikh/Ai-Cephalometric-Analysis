import json
import os
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class AnalysisNormsProvider:
    """
    Singleton provider that loads and serves cephalometric norms from analysis_norms.json.

    Usage:
        norms_provider.load("config/analysis_norms.json")   # once at startup
        lo, hi = norms_provider.get_norm_range("SNA")       # (80.0, 84.0)
        mean   = norms_provider.get_norm_mean("SNA")        # 82.0
    """
    _instance = None
    _norms_data: Dict[str, Any] = {}

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ── Loading ────────────────────────────────────────────────────────────────

    @classmethod
    def load(cls, file_path: str) -> bool:
        """Load the JSON file into memory. Returns True on success."""
        try:
            abs_path = os.path.abspath(file_path)
            if not os.path.exists(abs_path):
                logger.error(f"Norms file not found at {abs_path}")
                return False
            with open(abs_path, "r", encoding="utf-8") as f:
                cls._norms_data = json.load(f)
            analyses = list(cls._norms_data.get("analyses", {}).keys())
            logger.info(
                f"Loaded {len(analyses)} cephalometric analyses from {abs_path}: "
                f"{', '.join(analyses)}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to load cephalometric norms: {e}")
            cls._norms_data = {}
            return False

    @property
    def is_loaded(self) -> bool:
        return bool(self._norms_data)

    # ── Public accessors ───────────────────────────────────────────────────────

    @classmethod
    def get_all_norms(cls) -> Dict[str, Any]:
        """Return the complete norms dictionary for API exposure."""
        return cls._norms_data

    @classmethod
    def get_analysis_names(cls) -> List[str]:
        """Return list of available analysis names (e.g. ['Steiner', 'Tweed', ...])."""
        return list(cls._norms_data.get("analyses", {}).keys())

    @classmethod
    def get_norm_range(cls, measurement_code: str) -> Optional[tuple[float, float]]:
        """
        Resolve (min, max) for a measurement by name or short code.

        Search order:
          1. Exact name match in 'Full' composite analysis.
          2. First-token match (e.g. 'SNA') in 'Full'.
          3. Exact name match across all other analyses.
          4. First-token match across all other analyses.

        Returns None if no match is found (caller should use its fallback).
        """
        if not cls._norms_data or "analyses" not in cls._norms_data:
            return None

        analyses = cls._norms_data["analyses"]
        target = measurement_code.strip().lower()

        def _range_from(m: dict) -> Optional[tuple[float, float]]:
            r = m.get("range")
            if r and len(r) == 2:
                return (float(r[0]), float(r[1]))
            return None

        def _search(analysis_data: dict) -> Optional[tuple[float, float]]:
            first_token_match = None
            for m in analysis_data.get("measurements", []):
                name = m.get("name", "").strip().lower()
                tokens = name.split()
                if target == name:
                    return _range_from(m)    # exact match — return immediately
                if tokens and target == tokens[0] and first_token_match is None:
                    first_token_match = _range_from(m)  # first-token match — candidate
            return first_token_match

        # Priority 1 — 'Full' composite
        if "Full" in analyses:
            result = _search(analyses["Full"])
            if result:
                return result

        # Priority 2 — all other analyses in stable order
        for key, val in analyses.items():
            if key == "Full":
                continue
            result = _search(val)
            if result:
                return result

        return None

    @classmethod
    def get_norm_mean(cls, measurement_code: str) -> Optional[float]:
        """
        Return the 'normal' (mean) value for a measurement.
        Follows the same search order as get_norm_range().
        """
        if not cls._norms_data or "analyses" not in cls._norms_data:
            return None

        analyses = cls._norms_data["analyses"]
        target = measurement_code.strip().lower()

        def _search_mean(analysis_data: dict) -> Optional[float]:
            fallback = None
            for m in analysis_data.get("measurements", []):
                name = m.get("name", "").strip().lower()
                tokens = name.split()
                normal = m.get("normal")
                if normal is None:
                    continue
                if target == name:
                    return float(normal)
                if tokens and target == tokens[0] and fallback is None:
                    fallback = float(normal)
            return fallback

        if "Full" in analyses:
            result = _search_mean(analyses["Full"])
            if result is not None:
                return result

        for key, val in analyses.items():
            if key == "Full":
                continue
            result = _search_mean(val)
            if result is not None:
                return result

        return None

    @classmethod
    def get_norm_by_analysis(
        cls, analysis_name: str, measurement_code: str
    ) -> Optional[Dict[str, Any]]:
        """
        Return the full measurement dict for a specific analysis and measurement name.
        Returns None if not found.
        Example: get_norm_by_analysis("Steiner", "SNA")
            -> {"name": "SNA", "normal": 82.0, "unit": "degrees", "range": [80, 84]}
        """
        analyses = cls._norms_data.get("analyses", {})
        analysis = analyses.get(analysis_name)
        if not analysis:
            return None
        target = measurement_code.strip().lower()
        for m in analysis.get("measurements", []):
            name = m.get("name", "").strip().lower()
            tokens = name.split()
            if target == name or (tokens and target == tokens[0]):
                return m
        return None

    @classmethod
    def build_norm_context_for_llm(cls, measurement_codes: List[str]) -> str:
        """
        Build a compact normative-context string for injection into LLM prompts.

        Example output:
          SNA: norm 82°, range [80-84]; ANB: norm 2°, range [0-4]; ...
        """
        parts = []
        for code in measurement_codes:
            mean = cls.get_norm_mean(code)
            rng = cls.get_norm_range(code)
            if mean is not None and rng is not None:
                parts.append(f"{code}: norm {mean}, range [{rng[0]}-{rng[1]}]")
        return "; ".join(parts) if parts else "Normative data unavailable."


# Global singleton — import this everywhere
norms_provider = AnalysisNormsProvider()
