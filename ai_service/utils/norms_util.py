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
    def _apply_dynamic_adjustments(
        cls,
        target: str,
        normal: float,
        r_min: float,
        r_max: float,
        age: Optional[float],
        sex: Optional[str],
    ) -> tuple[float, float, float]:
        """
        Continuous polynomial norm adjustment for age and sex.

        Instead of fixed brackets, the adjustment is linearly interpolated
        between control points for each measurement, matching published
        longitudinal growth curve data more accurately.

        Sex dimorphism values from:
          Riolo et al., "An Atlas of Craniofacial Growth" (1974)
          McNamara & Brudon, "Orthodontics and Dentofacial Orthopedics" (2001)
        """
        t = target.upper()

        # ── Age adjustments (linear interpolation between control points) ──────
        # Each entry: (measurement_upper, [(age, delta_normal, delta_min, delta_max), ...])
        # Sorted by age ascending. Values are additive deltas from adult norms.
        AGE_CURVES: dict[str, list[tuple[float, float, float, float]]] = {
            "SNA":    [(8, +2.0, +1.5, +2.5), (12, +1.5, +1.0, +2.0), (16, +0.5, +0.5, +0.5), (18, 0, 0, 0)],
            "SNB":    [(8, -2.5, -2.5, -2.5), (12, -2.0, -2.0, -2.0), (16, -1.0, -1.0, -1.0), (18, 0, 0, 0)],
            "ANB":    [(8, +4.0, +3.5, +4.5), (12, +3.5, +3.0, +4.0), (16, +1.5, +1.5, +1.5), (18, 0, 0, 0)],
            "FMA":    [(8, +4.0, +4.0, +4.0), (12, +3.0, +3.0, +3.0), (16, +1.5, +1.5, +1.5), (18, 0, 0, 0)],
            "SN-GOGN":[(8, +4.0, +4.0, +4.0), (12, +3.0, +3.0, +3.0), (16, +1.5, +1.5, +1.5), (18, 0, 0, 0)],
            "AFH":    [(8, -18, -18, -18),     (12, -12, -12, -12),    (16, -5, -5, -5),        (18, 0, 0, 0)],
            "PFH":    [(8, -20, -20, -20),     (12, -14, -14, -14),    (16, -6, -6, -6),        (18, 0, 0, 0)],
            "LAFH":   [(8, -12, -12, -12),     (12, -8, -8, -8),       (16, -3, -3, -3),        (18, 0, 0, 0)],
        }

        if age is not None and t in AGE_CURVES:
            pts = AGE_CURVES[t]
            if age <= pts[0][0]:
                dn, dmin, dmax = pts[0][1], pts[0][2], pts[0][3]
            elif age >= pts[-1][0]:
                dn, dmin, dmax = pts[-1][1], pts[-1][2], pts[-1][3]
            else:
                # Linear interpolation between control points
                for j in range(len(pts) - 1):
                    a0, n0, lo0, hi0 = pts[j]
                    a1, n1, lo1, hi1 = pts[j + 1]
                    if a0 <= age <= a1:
                        t_ratio = (age - a0) / (a1 - a0)
                        dn   = n0  + t_ratio * (n1  - n0)
                        dmin = lo0 + t_ratio * (lo1 - lo0)
                        dmax = hi0 + t_ratio * (hi1 - hi0)
                        break
                else:
                    dn, dmin, dmax = 0.0, 0.0, 0.0
            normal += dn
            r_min  += dmin
            r_max  += dmax

        # ── Sex dimorphism adjustments ────────────────────────────────────────
        # Applied on top of age adjustments. Values from Riolo et al. 1974.
        is_male   = sex and sex.lower() in ("male",   "m")
        is_female = sex and sex.lower() in ("female", "f")
        effective_age = age or 18.0

        SEX_DELTA: dict[str, dict[str, tuple[float, float, float]]] = {
            # measurement: {male: (delta_norm, delta_min, delta_max),
            #               female: (delta_norm, delta_min, delta_max)}
            # Values from Riolo et al. 1974; McNamara & Brudon 2001.
            "SNA":     {"male": (+0.7, +0.5, +1.0), "female": (-0.7, -1.0, -0.5)},
            "SNB":     {"male": (+0.8, +0.5, +1.0), "female": (-0.8, -1.0, -0.5)},
            "ANB":     {"male": (-0.3, -0.5, -0.2), "female": (+0.3, +0.2, +0.5)},
            "FMA":     {"male": (-1.0, -1.5, -0.5), "female": (+1.0, +0.5, +1.5)},
            "AFH":     {"male": (+8.0, +6.0, +10.0), "female": (-8.0, -10.0, -6.0)},
            "PFH":     {"male": (+7.0, +5.0, +9.0),  "female": (-7.0, -9.0, -5.0)},
            "MANDLENGTH": {"male": (+8.0, +6.0, +10.0), "female": (-8.0, -10.0, -6.0)},
            "MIDFACELEN":  {"male": (+4.0, +3.0, +5.0),  "female": (-4.0, -5.0, -3.0)},
            # Wits appraisal: sex-stratified — female 0 ±2 mm, male −1 ±2 mm.
            # Reference: Jacobson A, AJO 1975; Richardson ME, EJO 1982.
            # Male norm is 1 mm lower (more negative) than female.
            "WITS":    {"male": (-1.0, -1.0, -1.0), "female": (+0.0,  0.0,  0.0)},
        }

        if effective_age >= 14 and t in SEX_DELTA:
            # Scale dimorphism linearly from 0 at age 12 to full value at 18+
            scale = min(1.0, max(0.0, (effective_age - 12) / 6))
            key = "male" if is_male else ("female" if is_female else None)
            if key:
                dn, dmin, dmax = SEX_DELTA[t][key]
                normal += dn * scale
                r_min  += dmin * scale
                r_max  += dmax * scale

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

    @classmethod
    def get_version(cls) -> Optional[str]:
        """Return the norms data version string for clinical audit trail."""
        return cls._norms_data.get("version")

    @classmethod
    def get_population_offset(
        cls,
        measurement_code: str,
        population: Optional[str],
    ) -> tuple[float, float]:
        """
        Return (delta_min, delta_max) population-specific norm offsets.

        Stub implementation — override with published population-specific
        values from AJO-DO literature when available:
          - Fonseca & Klein, AJO 1978 (African-American)
          - Chang, EJO 1987 (Chinese)
          - Interlandi & Sato, Am J Orthod 1991 (Brazilian)
        """
        if not population:
            return 0.0, 0.0
        t = measurement_code.strip().upper()
        # Population offsets vs Caucasian adult norms (additive to min and max).
        # Sources:
        #   Fonseca & Klein, AJO 1978 (African-American)
        #   Chang, EJO 1987 (Chinese/East Asian)
        #   Interlandi & Sato, Am J Orthod 1991 (Brazilian)
        #   Miyajima et al., AJO-DO 1996 (Japanese)
        #   Kaur & Singh, J Orthod Sci 2013 (Indian/South Asian)
        POPULATION_OFFSETS: dict[str, dict[str, tuple[float, float]]] = {
            "chinese": {
                "SNA":        (+1.5, +1.5),
                "SNB":        (+1.5, +1.5),
                "ANB":        ( 0.0,  0.0),
                "SN-GOGN":    (+1.0, +1.0),
                "FMA":        (+1.0, +1.0),
                "MIDFACELEN": (-2.0, -2.0),
                "MANDLENGTH": (-3.0, -3.0),
                "UI-NA_DEG":  (+2.0, +2.0),
                "LI-NB_DEG":  (+1.5, +1.5),
            },
            "east_asian": {
                "SNA":        (+1.5, +1.5),
                "SNB":        (+1.5, +1.5),
                "ANB":        ( 0.0,  0.0),
                "SN-GOGN":    (+1.0, +1.0),
                "FMA":        (+1.0, +1.0),
                "MIDFACELEN": (-2.0, -2.0),
                "MANDLENGTH": (-3.0, -3.0),
                "UI-NA_DEG":  (+2.0, +2.0),
                "LI-NB_DEG":  (+1.5, +1.5),
            },
            "japanese": {
                "SNA":        (+1.0, +1.0),
                "SNB":        (+1.5, +1.5),
                "ANB":        (-0.5, -0.5),
                "FMA":        (+1.5, +1.5),
                "SN-GOGN":    (+1.5, +1.5),
                "MIDFACELEN": (-2.5, -2.5),
                "MANDLENGTH": (-3.5, -3.5),
                "UI-NA_DEG":  (+3.0, +3.0),
                "LI-NB_DEG":  (+2.0, +2.0),
            },
            "african_american": {
                "SNA":        (+2.5, +2.5),
                "SNB":        (+1.5, +1.5),
                "ANB":        (+1.0, +1.0),
                "FMA":        (+2.0, +2.0),
                "SN-GOGN":    (+1.5, +1.5),
                "UI-NA_DEG":  (+3.0, +3.0),
                "LI-NB_DEG":  (+2.5, +2.5),
                "IMPA":       (+3.0, +3.0),
                "MANDLENGTH": (+2.0, +2.0),
            },
            "hispanic": {
                "SNA":        (+1.0, +1.0),
                "SNB":        (+0.5, +0.5),
                "ANB":        (+0.5, +0.5),
                "FMA":        (+1.0, +1.0),
                "UI-NA_DEG":  (+1.5, +1.5),
                "LI-NB_DEG":  (+1.5, +1.5),
            },
            "indian": {
                "SNA":        (+1.0, +1.0),
                "SNB":        (+0.5, +0.5),
                "ANB":        (+0.5, +0.5),
                "FMA":        (+1.5, +1.5),
                "SN-GOGN":    (+1.0, +1.0),
                "UI-NA_DEG":  (+2.0, +2.0),
                "LI-NB_DEG":  (+2.0, +2.0),
                "IMPA":       (+2.0, +2.0),
            },
            "south_asian": {
                "SNA":        (+1.0, +1.0),
                "SNB":        (+0.5, +0.5),
                "ANB":        (+0.5, +0.5),
                "FMA":        (+1.5, +1.5),
                "SN-GOGN":    (+1.0, +1.0),
                "UI-NA_DEG":  (+2.0, +2.0),
                "LI-NB_DEG":  (+2.0, +2.0),
                "IMPA":       (+2.0, +2.0),
            },
            "brazilian": {
                "SNA":        (+1.5, +1.5),
                "SNB":        (+1.0, +1.0),
                "ANB":        (+0.5, +0.5),
                "FMA":        (+1.0, +1.0),
                "UI-NA_DEG":  (+2.5, +2.5),
                "LI-NB_DEG":  (+2.0, +2.0),
            },
        }
        pop_key = population.lower().replace("-", "_").replace(" ", "_")
        offsets = POPULATION_OFFSETS.get(pop_key, {})
        delta = offsets.get(t, (0.0, 0.0))
        return delta


# Global singleton — import this everywhere
norms_provider = AnalysisNormsProvider()
