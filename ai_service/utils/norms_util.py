import json
import os
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class AnalysisNormsProvider:
    """
    Singleton provider that loads and serves cephalometric norms from
    ``analysis_norms.json``.

    Usage::

        norms_provider.load("config/analysis_norms.json")   # once at startup
        lo, hi = norms_provider.get_norm_range("SNA")       # (80.0, 84.0)
        mean   = norms_provider.get_norm_mean("SNA")        # 82.0
    """

    _instance: Optional["AnalysisNormsProvider"] = None
    _norms_data: Dict[str, Any] = {}

    def __new__(cls, *args: Any, **kwargs: Any) -> "AnalysisNormsProvider":
        if cls._instance is None:
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

    # ── Internal search helpers ────────────────────────────────────────────────

    @classmethod
    def _iter_analyses(cls) -> list[tuple[str, dict]]:
        """
        Return (name, analysis_data) pairs with 'Full' first, then all others.
        This enforces a stable search priority across all lookup methods.
        """
        analyses = cls._norms_data.get("analyses", {})
        pairs: list[tuple[str, dict]] = []
        if "Full" in analyses:
            pairs.append(("Full", analyses["Full"]))
        for key, val in analyses.items():
            if key != "Full":
                pairs.append((key, val))
        return pairs

    @classmethod
    def _find_measurement(cls, target: str, analysis_data: dict) -> Optional[dict]:
        """
        Find a measurement entry by exact name or first-token match.
        Returns the measurement dict or None.
        """
        for m in analysis_data.get("measurements", []):
            name = m.get("name", "").strip().lower()
            code = m.get("code", "").strip().lower()
            if target == name or target == code:
                return m  # Exact match on name or code
        return None

    @classmethod
    def _apply_dynamic_adjustments(cls, target: str, normal: float, r_min: float, r_max: float, age: Optional[float], sex: Optional[str]) -> tuple[float, float, float]:
        """
        Applies dynamic normative splines based on patient demographics.
        Growth studies show significant variance in cephalometric norms before adulthood.
        """
        t = target.upper()
        if age is not None:
            # Mandibular growth (SNB) continues longer than maxillary (SNA), reducing ANB and FMA over time.
            if t == "SNA":
                if age < 12:
                    normal += 1.5; r_min += 1.0; r_max += 2.0
                elif age < 16:
                    normal += 0.5; r_min += 0.5; r_max += 0.5
            elif t == "SNB":
                if age < 12:
                    normal -= 2.0; r_min -= 2.0; r_max -= 2.0
                elif age < 16:
                    normal -= 1.0; r_min -= 1.0; r_max -= 1.0
            elif t == "ANB":
                if age < 12:
                    normal += 3.5; r_min += 3.0; r_max += 4.0
                elif age < 16:
                    normal += 1.5; r_min += 1.5; r_max += 1.5
            elif t == "FMA":
                if age < 12:
                    normal += 3.0; r_min += 3.0; r_max += 3.0
                elif age < 16:
                    normal += 1.5; r_min += 1.5; r_max += 1.5
                    
            # Sex dimorphism in late adolescent growth
            if sex and sex.lower() in ["male", "m"] and age >= 16:
                if t == "SNB":
                    normal += 0.5; r_max += 1.0
                elif t == "FMA":
                    normal -= 1.0; r_min -= 1.0

        return normal, r_min, r_max

    # ── Public accessors ───────────────────────────────────────────────────────

    @classmethod
    def get_all_norms(cls) -> Dict[str, Any]:
        """Return the complete norms dictionary for API exposure."""
        return cls._norms_data

    @classmethod
    def get_analysis_names(cls) -> List[str]:
        """Return the list of available analysis names (e.g. ['Steiner', 'Tweed', …])."""
        return list(cls._norms_data.get("analyses", {}).keys())

    @classmethod
    def get_norm_range(cls, measurement_code: str, age: Optional[float] = None, sex: Optional[str] = None) -> Optional[tuple[float, float]]:
        """
        Resolve (min, max) for a measurement by name or short code, adjusted for age/sex.

        Search order: 'Full' composite first, then all other analyses in
        definition order. Returns None if no match is found.
        """
        if not cls._norms_data:
            return None
        target = measurement_code.strip().lower()
        for _, analysis_data in cls._iter_analyses():
            m = cls._find_measurement(target, analysis_data)
            if m is not None:
                r = m.get("range")
                if r and len(r) == 2:
                    normal = float(m.get("normal", (r[0]+r[1])/2))
                    _, adj_min, adj_max = cls._apply_dynamic_adjustments(target, normal, float(r[0]), float(r[1]), age, sex)
                    return adj_min, adj_max
        return None

    @classmethod
    def get_norm_mean(cls, measurement_code: str, age: Optional[float] = None, sex: Optional[str] = None) -> Optional[float]:
        """
        Return the 'normal' (mean) value for a measurement, adjusted for age/sex.
        Follows the same search order as :meth:`get_norm_range`.
        """
        if not cls._norms_data:
            return None
        target = measurement_code.strip().lower()
        for _, analysis_data in cls._iter_analyses():
            m = cls._find_measurement(target, analysis_data)
            if m is not None:
                normal = m.get("normal")
                if normal is not None:
                    r = m.get("range", [normal, normal])
                    adj_norm, _, _ = cls._apply_dynamic_adjustments(target, float(normal), float(r[0]), float(r[1]), age, sex)
                    return adj_norm
        return None

    @classmethod
    def get_norm_by_analysis(
        cls, analysis_name: str, measurement_code: str
    ) -> Optional[Dict[str, Any]]:
        """
        Return the full measurement dict for a specific analysis and measurement name.

        Example::

            get_norm_by_analysis("Steiner", "SNA")
            # → {"name": "SNA", "normal": 82.0, "unit": "degrees", "range": [80, 84]}
        """
        analyses = cls._norms_data.get("analyses", {})
        analysis = analyses.get(analysis_name)
        if not analysis:
            return None
        target = measurement_code.strip().lower()
        return cls._find_measurement(target, analysis)

    @classmethod
    def build_norm_context_for_llm(cls, measurement_codes: List[str]) -> str:
        """
        Build a compact normative-context string for injection into LLM prompts.

        Example output::

            SNA: norm 82°, range [80-84]; ANB: norm 2°, range [0-4]; …
        """
        parts: list[str] = []
        for code in measurement_codes:
            mean = cls.get_norm_mean(code)
            rng  = cls.get_norm_range(code)
            if mean is not None and rng is not None:
                parts.append(f"{code}: norm {mean}, range [{rng[0]}-{rng[1]}]")
        return "; ".join(parts) if parts else "Normative data unavailable."


# Global singleton — import this everywhere
norms_provider = AnalysisNormsProvider()
