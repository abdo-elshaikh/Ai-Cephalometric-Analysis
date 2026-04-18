# AI Cephalometric Analysis System - UML Diagrams

This document contains professional technical diagrams detailing the system architecture, domain entities, use cases, and sequence flows for the AI-Based Cephalometric Analysis System.

## 1. System Architecture Diagram

This diagram outlines the microservices-based architecture, illustrating how the React frontend interacts with the ASP.NET Core API and the Python FastAPI AI microservice, along with external dependencies.

```mermaid
graph TD
    User([Doctor / Clinic User]) <-->|HTTPS| Frontend[React 18 + TypeScript Frontend]
    
    subgraph System Backend
        Frontend <-->|REST API| DotNet[ASP.NET Core 8 Web API]
        
        DotNet -->|Read/Write Model| DB[(PostgreSQL 16 Database)]
        DotNet -->|Cache/Session| Redis[(Redis 7 Cache)]
        DotNet -->|Store/Retrieve DICOM/Images| BlobStorage[(AWS S3 / Azure Blob)]
        
        DotNet <-->|HTTP REST / gRPC| PythonAI[FastAPI AI Microservice]
        
        subgraph Python AI Microservice Engine
            PythonAI --> HRNet[HRNet/YOLOv8 Pose Model]
            PythonAI --> MLEngine[ML Treatment Classifier]
            PythonAI --> DiagEngine[Diagnosis Rule Engine]
            PythonAI --> PDFEngine[WeasyPrint PDF Generator]
        end
        
        PythonAI <-->|API Call via LLM Engine| ExternalLLM[OpenAI API / LLaMA]
    end
```

---

## 2. Domain Class Diagram

This class diagram represents the core entities in the Clean Architecture Domain layer and how they relate to one another within the system.

```mermaid
classDiagram
    class User {
        +UUID Id
        +String Username
        +String Email
        +String PasswordHash
        +Role Role
    }
    
    class Patient {
        +UUID Id
        +String FirstName
        +String LastName
        +DateTime DateOfBirth
        +Gender Gender
        +UUID DoctorId
    }
    
    class Study {
        +UUID Id
        +UUID PatientId
        +DateTime CreatedAt
        +StudyStatus Status
    }
    
    class XRayImage {
        +UUID Id
        +UUID StudyId
        +String StorageUrl
        +Boolean IsCalibrated
        +Float PixelSpacingMm
    }
    
    class AnalysisSession {
        +UUID Id
        +UUID XRayImageId
        +DateTime Timestamp
        +SessionStatus Status
    }
    
    class Landmark {
        +UUID Id
        +UUID AnalysisSessionId
        +String Code
        +Float X
        +Float Y
        +Float Confidence
        +Boolean IsManuallyAdjusted
    }
    
    class Measurement {
        +UUID Id
        +UUID AnalysisSessionId
        +String Code
        +Float Value
        +String Status
    }
    
    class Diagnosis {
        +UUID Id
        +UUID AnalysisSessionId
        +String SkeletalClass
        +String VerticalPattern
        +String SummaryText
    }
    
    class TreatmentPlan {
        +UUID Id
        +UUID AnalysisSessionId
        +Int PlanIndex
        +String TreatmentType
        +String RationaleText
    }

    class Report {
        +UUID Id
        +UUID AnalysisSessionId
        +String PdfStorageUrl
        +DateTime GeneratedAt
    }

    User "1" -- "*" Patient : Manages >
    Patient "1" -- "*" Study : Has >
    Study "1" -- "*" XRayImage : Contains >
    XRayImage "1" -- "*" AnalysisSession : Analyzed In >
    AnalysisSession "1" -- "*" Landmark : Produces >
    AnalysisSession "1" -- "*" Measurement : Computes >
    AnalysisSession "1" -- "1" Diagnosis : Derives >
    AnalysisSession "1" -- "*" TreatmentPlan : Suggests >
    AnalysisSession "1" -- "*" Report : Generates >
```

---

## 3. High-Level Use Case Diagram

This diagram visualizes the main interactions between the users (Doctors, Admins) and the core features of the system.

```mermaid
flowchart LR
    Doctor([Doctor / End User])
    Admin([System Admin])

    subgraph "AI Cephalometric System"
        ManagePatients(Manage Patients & Studies)
        UploadXRay(Upload & Calibrate X-Rays)
        RunAnalysis(Run AI Landmark Detection)
        EditLandmarks(Manually Edit Landmarks)
        ViewResults(View Diagnosis & Measurements)
        GenTreatment(Generate Treatment Plan)
        GenReport(Export to PDF Report)
        ManageUsers(Manage Users & System Config)
    end

    Doctor --> ManagePatients
    Doctor --> UploadXRay
    Doctor --> RunAnalysis
    Doctor --> EditLandmarks
    Doctor --> ViewResults
    Doctor --> GenTreatment
    Doctor --> GenReport

    Admin --> ManageUsers
    Admin -.->|Extends| Doctor
```

---

## 4. Sequence Diagram: Upload & Analysis Flow

This sequence diagrams walks through the critical path of uploading an X-Ray completely through to generating the AI-driven treatment plans and results. 

```mermaid
sequenceDiagram
    actor Doctor
    participant UI as React Frontend
    participant API as ASP.NET Core API
    participant DB as PostgreSQL
    participant Blob as Blob Storage
    participant AI as AI Microservice (FastAPI)
    participant LLM as OpenAI / LLaMA

    Doctor->>UI: Upload X-Ray Image
    UI->>API: POST /api/studies/{id}/images
    API->>Blob: Save X-Ray file
    Blob-->>API: Return secure storage URL
    API->>DB: Record XRayImage Metadata
    API-->>UI: 201 Created (ImageId)
    
    Doctor->>UI: Click "Run AI Analysis"
    UI->>API: POST /api/images/{id}/analyze
    API->>DB: Init AnalysisSession (Processing)
    
    Note over API, AI: AI Pipeline Execution
    API->>AI: POST /ai/detect-landmarks {imageUrl}
    AI->>Blob: Fetch Image File
    AI->>AI: Run Deep Learning Model (HRNet)
    AI-->>API: Return [Landmarks List]
    API->>DB: Bulk Insert Landmarks
    
    API->>AI: POST /ai/calculate-measurements {landmarks}
    AI->>AI: Computed Geometry & Rules
    AI-->>API: Return [Measurements, Diagnosis]
    API->>DB: Save Measurements & Diagnosis
    
    API->>AI: POST /ai/suggest-treatment {diagnosis, measurements}
    AI->>LLM: Request clinical rationale
    LLM-->>AI: Stream rationale response
    AI-->>API: Return [Treatment Plans]
    API->>DB: Save Treatment Plans & Complete Session
    
    API-->>UI: 200 OK (Full Analysis Results)
    Doctor->>UI: Reviews & Edits Landmarks/Treatment
```

---

## 5. Entity-Relationship (ER) Diagram

This diagram visualizes the PostgreSQL database schema, highlighting primary and foreign keys, as well as one-to-many relationships across the system.

```mermaid
erDiagram
    USERS ||--o{ PATIENTS : "manages"
    PATIENTS ||--o{ STUDIES : "has"
    STUDIES ||--o{ XRAY_IMAGES : "contains"
    XRAY_IMAGES ||--o{ ANALYSIS_SESSIONS : "analyzed_in"
    ANALYSIS_SESSIONS ||--o{ LANDMARKS : "produces"
    ANALYSIS_SESSIONS ||--o{ MEASUREMENTS : "computes"
    ANALYSIS_SESSIONS ||--|| DIAGNOSES : "derives"
    ANALYSIS_SESSIONS ||--o{ TREATMENT_PLANS : "suggests"
    ANALYSIS_SESSIONS ||--o{ REPORTS : "generates"

    USERS {
        uuid id PK
        varchar username
        varchar email
        varchar password_hash
        varchar role
        timestamp created_at
    }

    PATIENTS {
        uuid id PK
        uuid user_id FK "Doctor ID"
        varchar first_name
        varchar last_name
        date dob
        varchar gender
    }

    STUDIES {
        uuid id PK
        uuid patient_id FK
        timestamp created_at
        varchar status
    }

    XRAY_IMAGES {
        uuid id PK
        uuid study_id FK
        varchar storage_url
        boolean is_calibrated
        float pixel_spacing_mm
    }

    ANALYSIS_SESSIONS {
        uuid id PK
        uuid xray_image_id FK
        timestamp started_at
        varchar status
    }

    LANDMARKS {
        uuid id PK
        uuid analysis_session_id FK
        varchar code
        float x_coordinate
        float y_coordinate
        float confidence
        boolean is_adjusted
    }

    MEASUREMENTS {
        uuid id PK
        uuid analysis_session_id FK
        varchar code
        float value
        varchar category
    }

    DIAGNOSES {
        uuid id PK
        uuid analysis_session_id FK
        varchar skeletal_class
        varchar vertical_pattern
        text summary
    }

    TREATMENT_PLANS {
        uuid id PK
        uuid analysis_session_id FK
        int rank_index
        varchar treatment_type
        text rationale
    }

    REPORTS {
        uuid id PK
        uuid analysis_session_id FK
        varchar pdf_url
        timestamp generated_at
    }
```
