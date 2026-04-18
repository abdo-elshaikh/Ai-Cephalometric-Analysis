namespace CephAnalysis.Domain.Enums;

public enum TreatmentType
{
    FunctionalAppliance,
    Headgear,
    Extraction,
    Expansion,
    Braces,
    IPR,
    Surgery,
    Observation
}

public enum TreatmentSource
{
    RuleBased,
    ML,
    LLM,
    Hybrid
}
