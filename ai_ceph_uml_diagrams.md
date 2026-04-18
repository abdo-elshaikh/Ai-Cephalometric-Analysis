# AI Cephalometric Analysis — UML Diagrams

This document contains professional UML and architectural diagrams representing the core structure, entity relationships, and behavioral flows of the AI Cephalometric Analysis System. These models are based on the system's architecture and the requirements outlined in the implementation plan.

## 1. System Architecture Diagram

This component diagram visualizes the high-level architecture of the application, including the interaction between the React frontend, .NET Web API backend, Python AI microservice, and external components like PostgreSQL, Redis, Blob Storage, and the OpenAI LLM.

```mermaid
graph TD
    Client((Doctor / User)) -->|HTTPS / REST| UI
    
    subgraph Frontend Application
        UI[React 18 + TS Single Page App]
    end

    subgraph Backend Services [.NET 9 Clean Architecture]
        API[API Presentation Layer]
        App[Application Layer - CQRS]
        Dom[Domain Layer - Entities]
        Inf[Infrastructure Layer]
        
        API --> App
        App --> Dom
        App --> Inf
    end

    subgraph AI Microservice [FastAPI Python]
        Router[API Routers]
        EngL[Landmark Detection HRNet/YOLO]
        EngM[Measurement Calcs]
        EngD[Diagnosis Classifier]
        EngT[Treatment ML & Rule Engine]
        
        Router --> EngL
        Router --> EngM
        Router --> EngD
        Router --> EngT
    end

    UI -->|JWT Auth / API Calls| API
    Inf -->|HTTPClient REST| Router
    
    DB[(PostgreSQL 16)]
    Cache[(Redis 7)]
    Storage[(AWS S3 / Azure Blob)]
    LLM[OpenAI GPT-4o]

    Inf --> DB
    Inf --> Cache
    Inf --> Storage
    
    EngT -->|API Call| LLM
```

---

## 2. Domain Class Diagram (Entity Relationship)

This class diagram represents the DDD (Domain-Driven Design) core entities, their properties, and their cardinality. It models the core medical context including Patients, Studies, X-Rays, Sessions, and generated AI artifacts.

```mermaid
classDiagram
    direction TB
    class User {
        +UUID Id
        +String FullName
        +String Email
        +String PasswordHash
        +Role Role
        +Authenticate()
    }
    class Patient {
        +UUID Id
        +String Firstname
        +String Lastname
        +Date DateOfBirth
        +Gender Gender
        +GetAge() Int
    }
    class Study {
        +UUID Id
        +Date StudyDate
        +StudyStatus Status
        +AddXRayImage()
    }
    class XRayImage {
        +UUID Id
        +String FilePath
        +String MimeType
        +Float SizeMb
        +Boolean IsCalibrated
        +Float PixelSpacingMm
        +Calibrate(knownMm, p1, p2)
    }
    class AnalysisSession {
        +UUID Id
        +SessionStatus Status
        +Date CreatedAt
        +StartAnalysis()
        +Recalculate()
    }
    class Landmark {
        +String Code
        +Float X
        +Float Y
        +Float Confidence
        +Boolean IsManuallyAdjusted
        +UpdateCoordinates(x, y)
    }
    class Measurement {
        +String Name
        +String Type
        +Float Value
        +String ClinicalStatus
        +Float Deviation
    }
    class Diagnosis {
        +String SkeletalClass
        +String VerticalPattern
        +Float Confidence
        +String Summary
    }
    class TreatmentPlan {
        +Integer PlanIndex
        +String RecommendedType
        +String LLMRationale
        +Float ConfidenceScore
    }
    class Report {
        +UUID Id
        +String PdfPath
        +Date GeneratedAt
    }
    
    User "1" -- "*" Patient : Manages >
    Patient "1" *-- "*" Study : Contains >
    Study "1" *-- "1..*" XRayImage : Contains >
    Study "1" *-- "*" AnalysisSession : Triggers >
    AnalysisSession "1" *-- "19..40" Landmark : Detects >
    AnalysisSession "1" *-- "13..*" Measurement : Computes >
    AnalysisSession "1" *-- "1" Diagnosis : Derives >
    AnalysisSession "1" *-- "1..3" TreatmentPlan : Recommends >
    AnalysisSession "1" *-- "*" Report : Generates >
```

---

## 3. End-to-End Analysis Workflow (Sequence Diagram)

This sequence diagram depicts the chronological flow of messages between the Doctor, the UI, the monolithic Backend, the external Storage, and the AI Microservice during the core Analysis pipeline.

```mermaid
sequenceDiagram
    autonumber
    actor Doctor
    participant UI as React Frontend
    participant API as .NET Core Backend
    participant Store as S3/Blob Storage
    participant AI as Python AI Service
    participant LLM as OpenAI GPT-4o
    
    Doctor->>UI: Upload X-Ray Image (DICOM/PNG)
    UI->>API: POST /api/studies/{id}/images
    API->>Store: Persist File Data
    Store-->>API: URL Resource
    API-->>UI: 200 OK (Image Ready)

    Note over Doctor, UI: Optional Calibration Phase (Pixel to mm)
    
    Doctor->>UI: Request Cephalometric Analysis
    UI->>API: POST /api/images/{id}/analyze
    
    activate API
    API->>AI: POST /ai/detect-landmarks (Image Blob)
    AI-->>API: Return [Landmark Coordinates]
    
    API->>AI: POST /ai/calculate-measurements (Landmarks)
    AI-->>API: Return [Measurements & Stats]
    
    API->>AI: POST /ai/classify-diagnosis (Measurements)
    AI-->>API: Return Diagnosis Summary
    
    API->>AI: POST /ai/suggest-treatment (Diagnosis)
    activate AI
    AI->>LLM: Request clinical justification prompt
    LLM-->>AI: LLM generated rationale text
    AI-->>API: Return Treatment Plans + Rationale
    deactivate AI
    
    API-->>UI: 200 OK Complete Session JSON
    deactivate API
    
    UI-->>Doctor: Display Interactive Canvas, Metrics & Plan
    
    Note over Doctor, API: Manual Override Flow
    
    Doctor->>UI: Drag Landmark (Manual Adjustment)
    UI->>API: PUT /api/sessions/{id}/landmarks/{code}
    API->>API: Trigger cascade recalculation
    API-->>UI: 200 OK Updated Dashboard
    
    Doctor->>UI: Generate Report
    UI->>API: POST /api/sessions/{id}/reports
    API->>Store: Save PDF generated by QuestPDF/WeasyPrint
    API-->>UI: PDF Download Link
    UI-->>Doctor: PDF Displayed in Browser
```

---

## 4. AI Service Activity Flow

This diagram outlines the internal logical flow executed by the Python FastAPI microservice when processing cephalometric data.

```mermaid
stateDiagram-v2
    [*] --> DetectLandmarks
    DetectLandmarks --> ValidateLandmarks
    ValidateLandmarks --> ErrorModelFailed : Confidence < Threshold
    ValidateLandmarks --> CalculateMeasurements : Confidence >= Threshold
    
    CalculateMeasurements --> CompareRanges
    CompareRanges --> ClassifyDiagnosis
    
    state ClassifyDiagnosis {
        direction LR
        SkeletalClass
        VerticalPattern
        DentalInclination
    }
    
    ClassifyDiagnosis --> HybridTreatmentEngine
    
    state HybridTreatmentEngine {
        direction LR
        RuleEngine --> GenerateRationale
        MLClassifier --> GenerateRationale
    }
    
    HybridTreatmentEngine --> [*]: Return Session Container Payload
```
