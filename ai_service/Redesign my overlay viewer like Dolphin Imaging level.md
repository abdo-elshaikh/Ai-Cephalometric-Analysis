# Comprehensive Improvement Plan for Cephalometric AI Service

## 1. Introduction

This report provides a comprehensive analysis of the existing AI service for cephalometric analysis, as implemented in the `Ai-Cephalometric-Analysis` GitHub repository, and proposes a scientific improvement plan. The current service aims to automate landmark detection, measurement, diagnosis, and treatment planning from cephalometric radiographs. While the existing architecture demonstrates a foundational approach to integrating AI in orthodontics, this report identifies opportunities for enhancement by incorporating state-of-the-art scientific methods to improve accuracy, reliability, and clinical utility, particularly in landmark identification, medical diagnosis, and the generation of treatment plans.

## 2. Current AI Service Analysis

The existing AI service is structured as a FastAPI application, integrating various Python modules for its core functionalities. A detailed examination of the key components reveals the following:

### 2.1. Landmark Detection

The `landmark_engine.py` module is responsible for identifying anatomical landmarks on cephalometric images. It utilizes a **UNet** deep learning model, trained to detect 38 specific landmarks. Post-processing is performed by a `ScientificRefiner` class, which applies rule-based anatomical checks and confidence adjustments. For instance, it verifies the relative positions of landmarks like Sella (S) and Nasion (N) and assesses the Frankfort Horizontal (Po-Or) angle to detect excessive head tilt. It also derives missing or low-confidence landmarks (e.g., Menton, PNS) based on the positions of other detected points and anatomical relationships. The model uses `torchvision.transforms` for image preprocessing, including resizing and normalization.

### 2.2. Measurement

The `measurement_engine.py` module calculates various cephalometric measurements based on the detected landmarks. It includes a suite of geometric functions for computing Euclidean distances, angles between points, and line-to-line angles. Crucially, it also handles signed perpendicular distances, adhering to clinical sign conventions. The module defines a comprehensive `MEASUREMENT_DEFS` table, encompassing measurements from Steiner, Tweed, McNamara, Jarabak, Ricketts, and other analyses. These definitions specify the required landmarks, calculation functions, and normal ranges. The `norms_provider` (from `utils/norms_util.py`) dynamically supplies normative data, allowing for the classification of measurements as 'Increased', 'Decreased', or 'Normal' and the computation of deviations from the mean.

### 2.3. Diagnosis

The `diagnosis_engine.py` module performs rule-based classification of skeletal class, vertical pattern, and soft tissue profile. It incorporates several evidence-based methods, such as Hasund's ANB Correction for maxillary rotation, Kim's APDI/ODI for robust skeletal and vertical diagnosis, and Holdaway H-Angle for soft tissue assessment. The system also includes probabilistic classification for borderline cases and adjusts norms based on patient age and sex. The diagnostic logic relies on predefined thresholds and rules to categorize conditions like skeletal Class I, II, or III, and vertical patterns (Low Angle, Normal, High Angle). An optional LLM integration is available to generate clinical summaries, enriching the rule-based output with natural language explanations.

### 2.4. Treatment Planning

The `treatment_engine.py` module suggests treatment plans based on a set of predefined `TREATMENT_RULES`. Each rule specifies conditions (e.g., skeletal class, age, vertical pattern, specific measurements) and a confidence score. The `calculate_suitability` function evaluates these rules against the patient's clinical profile, assigning a suitability score. Plans with a score above a minimum threshold are ranked and presented, with up to three top plans returned. The system also includes fallback to a 'Longitudinal Monitoring' plan if no suitable intervention is identified. Similar to diagnosis, LLM integration can be used to generate and populate rationales for the suggested treatment plans, providing more detailed explanations than the static rule templates.

## 3. Proposed Improvements

To enhance the scientific rigor, accuracy, and clinical reliability of the AI cephalometric service, the following improvements are proposed, drawing upon state-of-the-art methods in AI and medical imaging:

### 3.1. Landmark Detection Enhancement

1.  **Advanced Deep Learning Architectures**: While UNet is a solid foundation, exploring more advanced architectures such as **YOLO (You Only Look Once)** or **Stacked Hourglass Networks** could significantly improve landmark detection accuracy and robustness. YOLO offers high speed and precision, while Stacked Hourglass Networks are particularly adept at capturing spatial relationships, which is crucial for cephalometric landmarks [1].
2.  **Uncertainty Quantification with BCNNs**: Implementing **Bayesian Convolutional Neural Networks (BCNNs)** would allow the model to provide not just a landmark prediction, but also an estimate of its confidence or uncertainty. This is vital for clinical interpretability, enabling orthodontists to identify and manually review low-confidence predictions, thereby increasing the overall reliability of the system [1].
3.  **Multi-Stage Refinement**: Adopt a two-stage regression framework where an initial stage performs global localization, followed by a second stage that refines the landmark positions locally. This coarse-to-fine approach can mitigate large initial errors and improve precision [2].
4.  **Integration of Anatomical Constraints**: Further integrate and refine the `ScientificRefiner` class to incorporate more sophisticated anatomical rules and geometric constraints. This can act as a post-processing step to correct biologically implausible landmark placements, leveraging domain-specific knowledge to enhance AI predictions [1].
5.  **3D Cephalometric Landmark Detection**: While the current system focuses on 2D images, the future direction should involve transitioning to **3D CBCT-based analysis**. This would provide more precise anatomical information, eliminating projection errors inherent in 2D radiographs and enabling more accurate landmark localization [3].

### 3.2. Diagnosis Improvement

1.  **Dynamic Normative Data Integration**: The `norms_util.py` module currently provides normative data. This should be expanded to include more dynamic and personalized normative ranges based on patient demographics (age, sex, ethnicity) and growth stage. This would allow for more accurate and patient-specific diagnoses, moving beyond static, generalized norms [4].
2.  **Probabilistic Diagnostic Outputs**: Instead of definitive classifications, the diagnosis engine could provide probabilistic outputs for conditions (e.g., 70% likelihood of Class II malocclusion). This aligns with the uncertainty quantification in landmark detection and offers a more nuanced clinical picture, especially for borderline cases [1].
3.  **Enhanced AI for CVM Assessment**: Leverage advanced **Artificial Neural Networks (ANNs)** or other deep learning models specifically trained on large datasets for Cervical Vertebral Maturation (CVM) assessment. Studies show ANNs can achieve up to 95% accuracy in this critical diagnostic task, which is essential for growth-related treatment timing [1].
4.  **Integration of Advanced Indices**: Ensure full and robust implementation of advanced indices like Kim's APDI/ODI, and explore other composite indices that provide a more comprehensive assessment of skeletal and vertical relationships, as highlighted in the `diagnosis_engine.py` module's documentation [1].

### 3.3. Treatment Planning Advancement

1.  **Predictive Modeling for Treatment Outcomes**: Develop AI models that can predict treatment outcomes, including soft tissue changes, based on proposed treatment plans. This would allow for patient-specific simulations and help clinicians visualize the potential results of different interventions, moving beyond rule-based suggestions to predictive analytics [5].
2.  **Reinforcement Learning for Optimal Plans**: Explore the application of **Reinforcement Learning (RL)** to generate optimal treatment plans. RL agents could learn from a vast array of simulated patient cases and treatment strategies, identifying the most effective pathways to desired outcomes, considering various clinical factors and patient preferences [6].
3.  **Explainable AI (XAI) for Rationale Generation**: While LLMs are used for rationale generation, integrating **Explainable AI (XAI)** techniques would provide more transparent and verifiable explanations for suggested treatment plans. This would build greater trust in the AI system by showing *how* it arrived at a particular recommendation, rather than just *what* the recommendation is [7].
4.  **Continuous Learning and Feedback Loop**: Establish a system for continuous learning where clinical outcomes from actual treated cases are fed back into the AI model. This feedback loop would allow the model to adapt and improve its treatment recommendations over time, based on real-world effectiveness [8].

## 4. Conclusion

The `Ai-Cephalometric-Analysis` service provides a solid framework for automated cephalometric analysis. By integrating state-of-the-art AI methodologies, particularly in deep learning architectures for landmark detection, uncertainty quantification, dynamic normative data, predictive modeling for treatment outcomes, and Explainable AI, the service can significantly enhance its accuracy, reliability, and clinical utility. These proposed improvements aim to transform the current rule-based system into a more intelligent, adaptive, and clinically indispensable tool for orthodontists, ultimately leading to more precise diagnoses and effective, personalized treatment plans.
Alright — aiming for **Dolphin Imaging–level viewer** means you’re no longer building a “canvas with points,” you’re building a **clinical visualization system**.

I’ll redesign this as a **production-ready viewer architecture (React + SVG/WebGL + .NET backend)** with UX and features comparable to tools like Dolphin Imaging.

---

# 🧠 1. What “Dolphin-level” actually means

### Not just drawing…

It must support:

* Sub-millimeter precision
* Real-time interaction
* Layer control
* Measurement intelligence
* Clinical workflows

---

# 🎯 2. Core Viewer Architecture (Redesign)

### 🔷 Frontend Stack (React)

```tsx
ViewerEngine/
├── Core/
│   ├── CoordinateSystem.ts
│   ├── TransformEngine.ts
│
├── Rendering/
│   ├── SVGRenderer.tsx
│   ├── WebGLRenderer.ts (optional)
│
├── Layers/
│   ├── ImageLayer.tsx
│   ├── LandmarkLayer.tsx
│   ├── MeasurementLayer.tsx
│   ├── AnnotationLayer.tsx
│
├── Tools/
│   ├── PanZoomTool.ts
│   ├── LandmarkEditTool.ts
│   ├── MeasureTool.ts
│
└── UI/
    ├── Toolbar.tsx
    ├── LayerPanel.tsx
```

---

# 🎨 3. Rendering System (CRITICAL DECISION)

## ✅ Use SVG (not Canvas) for clinical overlay

### Why SVG?

* Vector precision (no pixel loss)
* Easy interaction (hover, click)
* Editable elements
* Perfect for medical tools

---

## 🧩 Layer System (like Photoshop)

### Each layer is independent:

### 🖼️ Image Layer

![Image](https://images.openai.com/static-rsc-4/954Y6_-PvcbEhN4lsNI9QZh4x7b19fH04_xKMpyqiKrWn6TYTinZ0E4FHKzlkOG78qETEIHXcpEinBxj1m7E6zntHjkwztgO4QGpZLHyLlnlbCOL0lQ-bNeruL9mqFgNz9OTeL9ov13Utxui_lTEjvytsIU_yIfwFy1OzuHetfOa-_gi4aqyd7_KMdJKlQZA?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/qkOdoIRsH3964j0QWJGZ82ZlGcOJ198qGC51X8gMR9BRDC2expbljsxBPdcN5S_CdmbhdPYV2Gnl1vhvqVKQ46T3g3GL5LRD6Ylag2bjYt6guhEI39hmfB8OUaZwh3s8h_i4Q-jQigRRUrhVGe2u7IkVGVLT_1gJKfGuEfjtrRKTTCOsrNnu2saS23UGTIRA?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/Er22WXlfFCBRO89rnU8GfsyiH8GziZWOEA2BbNFoseOA45_xemb2M3e1R3Hp257xxr-u6oFHWlkkQDagv_LJFxZiBvxgRhQRT7CS3LZHyOHC8U5VVN5CVWgHaCz7MdmCu2WOwqwr01qeh4cmi-Xii9-G6noWws8WLbLRYcDTuv-LqOaNTSOn8wM5gpz5ZbnP?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/KbvdzGA4LC7daFmaxlgc-y9MPdwV0ENzxS2qKY3ZXsvck8iYI-lrFiHgPiquKXSyFRNP1_QyKfInqyNtQ_g1mtWFWCgHtix5QjwUh1gMHJYG5i-3R5lV__OT0MulvZ7ZVNPcptg7WY9_f3ZdbpiTm4Gst3CxyvD_uoEOYenSrw2654z_ZtbbOTz0SuQtM6pz?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/Fo5thlef29gEoB2yJMEtfzO2HbmEjaJU7ON8xEWsR-d0llv0kLJxCCzRswpvBHfPMkAdZBG4zdUZcOOqIbnBA9-x9g24Wwzp-qJN_mRyzulWS1MRcvKRzX9zRKhPl7iBvkbZwZ9DNDFZlGuhtF0Sh3iXsT1F7K2Ql8N6XqZ6K6_bTykxJfb7wbxrPpyGx2Q1?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/w_QkzgSKYnuGq2olP2j_pJZ_Moa_7F8nVDys8K--BTJXV0c195jvs1Z7ruTA91s4nz1icBXmW71maRLruVb1-wtC-Mue0sFdI89WGUL2j13Qg1ueaaZ5CYhMiE6xjUidrejHVIjtPfm1eIlHOgupwO6l18vWVQLdDE_9j4yB-QZnmd0OVNUCdRAb2XI3QKm6?purpose=fullsize)

* Base X-ray
* Brightness / contrast controls
* Zoom-safe

---

### 📍 Landmark Layer

![Image](https://images.openai.com/static-rsc-4/c6tsNP1bmpa5IOEPLxTY8LHJFS52DNC2k7wKRcAIYfheEXUuaoTDsNLq1CBGD5alXb23YdkAFy4jffXCZBkkg-XgcjM7xDuhWWHqUwkEW-zLCLGm451sdHQp6agEt7utVBaPR5OHcxlWwWLyPHbQgozZcC8JILgxXC6EotGojVYTKl9f9B7NHt8WeIcX-JvG?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/u3AD4vbZP0YiuAmGkor5HEX3Wkd34Z2JWdpijfFocALmEOm_0RgfkHWKehiJQizrzqKHCGHh73I1opjB-kEhzGGw8paLGccFV_JbxffnppIQpeGSRmqNc6Mc2N-1pp_99zO41rpaFgfU-0c1HLjZUT3aMpetJf8I4JLGGe0J6MzZyW4TzliTf4CpXNUUbhro?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/ns7v59W2pjK-UrA6JPHkATCdIfsvsaREOD5eibeK7ObGS_Z5Gim1ouSqmOGxuIqmyuLY_DbDFyO_C94kdSvbK6pt0coi2x_wkntVkTiVimVZRB4GNW9oCkQBTnYQCeB3LvXyI75FaremsSQOQFG5Y_qvyr2HAvKPNKtGTXiXnrVDBB_FgaDVis6I47ylAnrY?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/t2416w8ZHbUbRPiKZJIYVoqpHyR9Aw4g3A4rcu-fHcVP3CWVkYLi7Ojl3B_0PBZ0YIk7dL7JcSgdemfH3WwQj74h6184Yl9ZtEML26VUIr9Mmwovq97HktoRLaTe_X3fBegAcsPHHJKXT1dhSDKpyyuMyaE0o0p8rWSWIp3orwZr2z13ZzpNpwBxUqDzZelO?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/mMQffcHS4337zoAFG9-d22DqYKNIsas4VVKLeJn1bkDGj531zQFmGWK_hiYPaPbNxp7GBx3YZMK7mmKhtDejqDs3Ncfv1j_-HUGFI6DdAOOp-KA4p_vysiNnBfWvxxRLPxWGeJGUg3UOX4pAEr7zd8N7lWyqEqOBZmDyuriBKvFMshNa2e8-yYNxSI5APr3W?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/ytlP74sWOuGO58MSCn6_AS5mxxBaEl60oqBqW6GuHoxj5xaok1byoIzl8uuzcbyxdSC3z2UzuGW8znpJwzxE3ccWt9M8m7dPWWnNdbJEPqSgfqV-Qej0hD0nXvPsQWjY98AdDc8Wj7nl1jA6hkrR2LmYrOgiQ2D5SQ0JoULJ7RAIm1xvkjTyMvV0vDSXhM7G?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/r9f3EB1dIBJjmRfRZ_YEfL4Bu1HUB17200WlfNT30HfrWGm9SHORkbfzLNu93Pb64d-iEYNjuuqMd9Q37pZAqUku0CoyIYfWXNM2PIhvH0Z0RplyFbAY9bMS8EGZZXeZvesgYb_OONYkDvhsj51eAYz114wQUgE0kEosO1Zl1slPRaxga090heevD5xZkuRn?purpose=fullsize)

* Draggable points
* Hover labels
* Confidence color coding:

  * 🟢 High
  * 🟡 Medium
  * 🔴 Low

---

### 📐 Measurement Layer

![Image](https://images.openai.com/static-rsc-4/6dubEUI21rIj8a8J-eZk1D-EUYXeXn8ypJq49LRBiEJBe1ksk5YhT6TdHy0gkW86KfXoTG_LjBg5G1HmMKG1inK0H7ztE9sYusAnjAJHM5WqlYar6llCAS1eq-_-HQqh7AR37MZyhoiXkYDsG1xxS50VK4WcsIYI_2aFKbcZ45ntaMRn7B3ar9Q7C_xh_T9k?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/kTdmOfVL9-UTz2x5a9tuXitxenDFNL6fChGe6VWOuX6talmho8LoR5qahZ4P7frEb1O2oH9aazHEJH2bIT-lJl0M-B7prlz5TE8GojIRV-P5Csgf2SF8G3edD_mfK1Ia0jsS9cRqjwSBCBhHoNlzfkh1SNI027TqyxkVO7KF1oucAPYowrBuVyUK8osLexaJ?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/i6qjYbFLDJMRwNY_n4vqMPYAwpoKUmMJZnbWVFm091BzYVTg1UW1YjP8mKqbkbj-mkZaaVq9ZAZ0ERLEk35O16byLrqf2V4xcar03pUR9OhowkVYr-XTuVTIDqoeSArpHlefQBIsKgOBhm3gWPkwd6J3iFzwF1_SX7Vi69nxAuhRKyLqOTnP-KKCpkWT88VW?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/jpdS7zqhd9PbD4TjoOqUc9KIj_90vect_HX8obUbpyG5ttP4YWn1CVh8JXGu9SMpIhQjn_uWbUOSFt1Vhw4tlvnFdCsClv4Whn8xq3Q2jJNhW8TxtR3Y-Ne8uB1N7Pf4gCkRMw2Z5GANHdv3eBzUY_tH6zpNMSOl93jjNbYCb8RjJEzLSv4op7KIKABzvBlH?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/971rnwP9D985zrCS2UxDjwqGYBRDESM619IjuNHtzh8DsB7oWYjPK9LH9r03JkUuh0cegjkgTUiq2lLyjSfP18UuWFvkU96lMDzx9Y9F6EJ7fG8s0Y_Kd3SnJQvRqONbY444xbipZlh-aEhi5TkdAV6VQyRk-VWurMQn1Zi5g17K5weox_d9soUElYg_r8k2?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/7lYWlCFl1XkEfdSPaLgtcC3Z-IjymyRkELevaU24HFf3L6X2_G-P6kb2W2i9tGh78fUdNGUUmyuHUdfZqQ5cedGMkTh2K2C4NiXa4N7GmZbchAGYaFGCqJcS0YbA0dhRkUvPyYmSuUWhhNnHE7jE2S1SgHU6bup4Gmp1NjIwVSOJ0nuED_8guZeNL6ckZDak?purpose=fullsize)

* Lines (SNA, SNB, ANB, etc.)
* Angles auto-calculated
* Live updates when dragging points

---

### 🧾 Annotation Layer

* Notes
* Text labels
* Clinical comments

---

# ⚙️ 4. Coordinate System (MOST IMPORTANT PART)

### Problem most people get wrong:

Image pixels ≠ anatomical coordinates

---

## ✅ Solution: normalized coordinate system

```ts
type Landmark = {
  id: string;
  x: number; // 0 → 1
  y: number; // 0 → 1
};
```

### Benefits:

* Resolution independent
* Works across devices
* Matches AI model output

---

# 🔍 5. Zoom & Pan Engine (Smooth + Clinical)

### Requirements:

* Infinite zoom (no blur)
* Center-based zoom
* Precision dragging

---

## Implementation idea:

```ts
transform = {
  scale: 1.5,
  translateX: 120,
  translateY: 80
}
```

Apply to SVG group:

```jsx
<g transform={`translate(${x}, ${y}) scale(${scale})`}>
```

---

# 🎯 6. Landmark Interaction (Dolphin-level UX)

### Features:

### ✅ Drag & Snap

* Drag point
* Snap to nearest edge (optional AI refinement)

---

### ✅ Hover intelligence

* Show:

  * Name (Sella, Nasion…)
  * Confidence
  * Coordinates

---

### ✅ Auto-refinement

When user moves point:
→ call backend API:

```http
POST /refine-landmark
```

---

# 📐 7. Real-time Measurement Engine

### Example:

```ts
function calculateAngle(A, B, C) {
  return Math.acos(dot(BA, BC) / (|BA| * |BC|));
}
```

---

### Live update:

* Drag point → instant recalculation
* No backend call needed

---

# 🧠 8. Smart Clinical Features (THIS is what makes it elite)

## 🔹 Toggle analysis types

* Steiner
* McNamara
* Ricketts

---

## 🔹 Auto-highlight abnormal values

Example:

```ts
if (ANB > 4) color = "red";
```

---

## 🔹 Profile overlay (advanced)

Overlay:

* soft tissue outline
* skeletal tracing

---

## 🔹 AI Confidence Heatmap (optional)

* Show where model is uncertain

---

# 🧩 9. UI/UX Design (Professional level)

### Toolbar:

* Select tool
* Landmark tool
* Measurement tool
* Reset

---

### Side Panel:

* Landmark list
* Measurements table
* Toggle layers

---

### Floating Info Box:

* Shows selected landmark data

---

# 🔗 10. Backend Integration (.NET)

### API design:

```http
POST /detect-landmarks
GET /analysis/{caseId}
POST /update-landmark
GET /treatment-suggestions
```

---

# 🚀 11. Performance Optimization

### MUST DO:

* Memoize layers
* Use `requestAnimationFrame`
* Debounce drag updates

---

# 🔥 12. What will make yours BETTER than Dolphin

Add:

### 💡 1. AI-assisted correction

* Suggest better landmark position

### 💡 2. Case comparison mode

* Overlay multiple patients

### 💡 3. Timeline tracking

* Before / after treatment

---

# 🧪 13. Example Component (simplified)

```tsx
<svg>
  <g transform={transform}>
    
    <ImageLayer src={xray} />
    
    <LandmarkLayer
      landmarks={points}
      onDrag={updatePoint}
    />
    
    <MeasurementLayer
      landmarks={points}
    />
    
  </g>
</svg>
```

---

# ⚠️ Honest Reality Check

To reach **true Dolphin level**, you need:

* High-accuracy AI (≤ 2mm error)
* Perfect UX (no lag)
* Clinical validation

Without these:

> It will look good, but doctors won’t trust it.

---

# 👉 If you want next step

I can:

* Build a **full React component (production-ready)**
* Design your **.NET API contracts**
* Or create **UI mockups (exact Dolphin-like interface)**

Just tell me what you want next:
👉 “code”, “UI design”, or “full system”

## 5. References

[1] Zaborowicz, K.; Zaborowicz, M.; Cieślińska, K.; Biedziak, B. Artificial Intelligence Methods in Cephalometric Image Analysis—A Systematic Narrative Review. *J. Clin. Med.* **2026**, *15*, 1920. Available online: [https://www.mdpi.com/2077-0383/15/5/1920](https://www.mdpi.com/2077-0383/15/5/1920) (accessed on 25 April 2026).
[2] A two-stage regression framework for automated cephalometric landmark detection. *Expert Systems with Applications*, 2024. Available online: [https://www.sciencedirect.com/science/article/abs/pii/S095741742401707X](https://www.sciencedirect.com/science/article/abs/pii/S095741742401707X) (accessed on 25 April 2026).
[3] Accuracy and reliability of 3D cephalometric landmark detection with deep learning. *Progress in Orthodontics*, 2025. Available online: [https://link.springer.com/article/10.1186/s40001-025-03198-8](https://link.springer.com/article/10.1186/s40001-025-03198-8) (accessed on 25 April 2026).
[4] Trends and application of artificial intelligence technology in orthodontic diagnosis and treatment planning—a review. *Applied Sciences*, 2022. Available online: [https://www.mdpi.com/2076-3417/12/22/11864](https://www.mdpi.com/2076-3417/12/22/11864) (accessed on 25 April 2026).
[5] Artificial intelligence for orthodontic diagnosis and treatment planning: A scoping review. *Journal of Orthodontics*, 2025. Available online: [https://www.sciencedirect.com/science/article/pii/S0300571224006122](https://www.sciencedirect.com/science/article/pii/S0300571224006122) (accessed on 25 April 2026).
[6] Decoding Deep Learning applications for diagnosis and treatment planning. *Dental Press Journal of Orthodontics*, 2023. Available online: [https://www.scielo.br/j/dpjo/a/NJRjTFWkF88xx95jtwfLLhk/?lang=en](https://www.scielo.br/j/dpjo/a/NJRjTFWkF88xx95jtwfLLhk/?lang=en) (accessed on 25 April 2026).
[7] A critical review of artificial intelligence based techniques for automatic prediction of cephalometric landmarks. *Artificial Intelligence Review*, 2025. Available online: [https://link.springer.com/article/10.1007/s10462-025-11135-8](https://link.springer.com/article/10.1007/s10462-025-11135-8) (accessed on 25 April 2026).
[8] Reliability and accuracy of Artificial intelligence-based software for cephalometric diagnosis. A diagnostic study. *BMC Oral Health*, 2024. Available online: [https://link.springer.com/article/10.1186/s12903-024-05097-6](https://link.springer.com/article/10.1186/s12903-024-05097-6) (accessed on 25 April 2026).
