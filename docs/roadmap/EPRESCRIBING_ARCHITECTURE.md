# E-prescribing: roadmap architecture (conceptual only)

**Status: NOT implemented and NOT in scope.** Nothing in NevOut Meds today receives, sends,
validates or dispenses against electronic prescriptions. NevOut Meds is **not** Surescripts
certified, integrated or "ready", and makes no such claim. This document records how the
question would be approached, so that no present design choice blocks it.

Current state that matters:
- products carry a `requires_prescription` flag;
- sales are recorded against customers;
- there is **no** prescription, prescriber or order model;
- there are **no** clinical records.

## 1. Two different markets

| | Liberia / African markets | United States |
|---|---|---|
| Regulator | Liberia Medicines and Health Products Regulatory Authority (LMHRA), plus national ministries; each country differs | FDA and DEA (federal), state boards of pharmacy, CMS |
| Prescription today | Mostly paper, handwritten; some hospital systems | Almost entirely electronic (NCPDP SCRIPT over a certified network) |
| Network | No national e-Rx network; any exchange would be bilateral (a clinic or hospital to a pharmacy) or through a future national HIS | Surescripts, or another certified intermediary, is effectively mandatory |
| Controlled substances | National narcotics rules; paper registers are common | EPCS: DEA 21 CFR 1311, identity proofing, two-factor signing, audited apps |
| Likely first step | **Prescription capture at the counter**: photo or scan of the paper prescription attached to a sale, with prescriber name and licence number as text, and a Rx-only sale requiring a captured prescription | Partnering with an already-certified pharmacy-system vendor, rather than building a network connection |

## 2. Liberia / African path (sketch)

1. **Prescription record (pharmacy-side only):**
   - image in the private `documents` bucket, tenant-scoped (already exists);
   - prescriber name and licence as entered, the patient (an existing customer), the items and
     quantities;
   - which sale lines dispensed it.
2. **Rules:**
   - selling a `requires_prescription` product needs a linked prescription;
   - partial fills are tracked;
   - the retention period follows national law.
3. **Access:** new capabilities such as `prescriptions.read` and `prescriptions.capture`, and a
   future **pharmacist** role. The capability registry makes this a data change.
4. **Privacy:** prescription images are health data. They need their own retention and access
   rules, stricter than customer contact data, and stay excluded from monitoring (Sentry policy
   §2).
5. **Later:** structured import from hospital or clinic systems if a national standard emerges
   (HL7 FHIR `MedicationRequest` is the likely vocabulary).

## 3. United States path: areas that would need research

This is **research only**; none of it is started.

| Area | Questions to answer |
|---|---|
| **NCPDP standards** | SCRIPT version (NewRx, RxChange, CancelRx, RxRenewal, RxFill, RxHistory); the Telecommunication standard for claims; message validation |
| **Network / partner** | Surescripts certification versus integrating a certified intermediary or pharmacy-management vendor; directory (NCPDP ID, NPI); message routing and acknowledgements |
| **Prescriber identity** | NPI and DEA numbers; state licence verification; directory synchronisation |
| **Patient identity** | Matching (demographics, no national ID); duplicate resolution; consent |
| **Medication and order model** | RxNorm and NDC coding; sig (structured directions); quantity and days supply; refills; substitutions; the prescription lifecycle states |
| **Changes and cancellations** | RxChange (therapeutic, generic, prior authorisation), CancelRx handling and audit, what a pharmacist may change |
| **Audit and provenance** | Immutable message and event trail; who dispensed what against which message; retention periods |
| **Controlled substances (EPCS)** | DEA 21 CFR 1311: pharmacy application audit and certification, digital signature validation, logical access controls, reporting to state PDMPs |
| **Identity proofing** | NIST 800-63 IAL2 for EPCS-capable users; credential issuance |
| **MFA and authorization** | EPCS requires two-factor for signing and access. The Phase 11 TOTP and capability model is a foundation, but EPCS has its own certified-factor and audit rules. |
| **Compliance** | HIPAA (covered entity or business associate; a BAA with every vendor, **including hosting and monitoring**); state pharmacy laws; SOC 2 expectations; certification testing |

## 4. What this means for today's design

- **Keep patients separate from staff.** A prescription's patient is data, not a user (see
  PATIENT_PORTAL_ARCHITECTURE.md).
- **Capabilities, not role names.** A pharmacist role and prescription capabilities can be
  added without touching screens.
- **Monitoring stays clinical-data-free.** The Sentry scrubbing policy already excludes notes,
  names and free text.
- **Hosting.** A U.S. launch with PHI would need BAAs with every processor. See
  HOSTING_DECISION_RECORD.md for the triggers.
