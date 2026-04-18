namespace CephAnalysis.Domain.Enums;

public enum MeasurementType
{
    Angle,
    Distance,
    Ratio
}

public enum MeasurementUnit
{
    Degrees,
    Millimeters,
    Percent
}

public enum MeasurementStatus
{
    Normal,
    Increased,
    Decreased
}

public enum DeviationSeverity
{
    Normal,
    Mild,
    Moderate,
    Severe
}
