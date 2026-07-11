Feature: Track 3: System Utilizes and Validates HCERT: PH4H MEOW
  Validates QR code, transforms and validates PH4H MEOW MedicationOverview Bundle.

  Background:
    Given User is the system under test
    And HCertDecoder is infrastructure at "http://hcert-validator:8080"
    # GITB-compatible FHIR validator (validator_cli.jar) — exposes
    # /itb/{igManager,transform,loadResource,fhir}/process. Handles IG load,
    # StructureMap transform, and profile validation natively so no
    # SmartHelper / Matchbox pair is needed.
    And FHIRValidator is infrastructure at "http://fhir-validator:8080"

  Scenario: tc-ph4h-qr-001 QR → decode → transform → MEOW conformance

    # ------------------------------------------------------------------
    # 1) Upload QR image and pull the raw HC1 payload.
    # ------------------------------------------------------------------
    When User uploads a QR image to HCertDecoder
    And extract "/qr_data" as "rawQRData"

    # ------------------------------------------------------------------
    # 2) Decode HC1 → captures $coseVal, $payloadVal, $hcertVal, $coseRaw.
    # ------------------------------------------------------------------
    When User decodes HC1 on HCertDecoder

    # ------------------------------------------------------------------
    # 3) Extract inner CWT payload content. The gdhcn-helper pre-serialises
    #    the -260/-7 sub-payload (PH4H MedicationOverviewMin) as a plain
    #    JSON *string* field (`hcert_inner_json`) — pulling it out as a
    #    scalar string means ${innerContent?json_string} in downstream
    #    envelopes just works. Extracting `/-260/-7` directly gives a
    #    nested-object value which trips ITB's coercion between string
    #    and map at scriptlet call boundaries.
    # ------------------------------------------------------------------
    And extract "/hcert_inner_json" as "innerContent"

    # ------------------------------------------------------------------
    # 4) Verify COSE signature against GDHCN **DEV** trustlist. PH4H
    #    signer keys live in the dev network; UAT would fail with
    #    "no matching KID in trustlist".
    # ------------------------------------------------------------------
    When User verifies COSE signature on HCertDecoder with:
      | parameter                  | value    |
      | use_gdhcn                  | true     |
      | gdhcn_env                  | dev      |
      | domain                     | PH4H     |
      | participant                | -        |
      | usage                      | DSC      |
      | verify_did_proof           | true     |
      | allow_unverified_trustlist | true     |
      | allow_remote_contexts      | true     |
      | context_dir                | contexts |
    Then "response status" should be "200"
    And extract "/valid" as "sigValid"
    And "sigValid" should be "true"

    # ------------------------------------------------------------------
    # 5) Load only the IGs the transform + validate need:
    #    - smart-ph4h: source LM + chained StructureMap
    #    - IHE Pharm MEOW: target Bundle profile
    #    smart-trust is NOT loaded here — that's the underlying trust
    #    framework used at signature-verify time, and it's already
    #    consumed by gdhcn-helper via the DID trustlist fetch. Loading
    #    it into the validator pulls in ~7k unrelated R4↔R5 conversion
    #    resources that this test doesn't need.
    # ------------------------------------------------------------------
    When User loads IG "https://worldhealthorganization.github.io/smart-ph4h/branches/MeOW-r4/package.tgz" on FHIRValidator
    Then "response status" should be "200"

    # IHE MEOW 1.0.0-preview — official publication (R4, inline-typed LMs,
    # https canonicals). Verified 2026-07-03: MedicationOverviewLM.patient is
    # PatientLM (not Reference), which the Min→LM transform requires.
    When User loads IG "https://profiles.ihe.net/PHARM/MEOW/package.tgz" on FHIRValidator
    Then "response status" should be "200"

    # ------------------------------------------------------------------
    # 6) Transform inner CWT payload → MEOW MedicationOverview Bundle via
    #    the WHO smart-ph4h chained map (Min → LM → Bundle). Canonical
    #    confirmed against the validator's loaded-map registry (CamelCase,
    #    no hyphens; also available as |0.9 / |0.9.9).
    # ------------------------------------------------------------------
    When User transforms "innerContent" on FHIRValidator with map "http://smart.who.int/ph4h/StructureMap/MedicationOverviewMinToMedicationOverviewBundle" as "bundleResult"
    Then "response status" should be "200"

    # ------------------------------------------------------------------
    # 7) Validate the resulting Bundle against the IHE Pharm MEOW
    #    MedicationOverview Bundle profile via the validator's
    #    /itb/fhir/validate endpoint.
    # ------------------------------------------------------------------
    # Canonical per the MEOW r4 branch build (https scheme; PHARM path; profile id
    # "MedicationOverview") — the old ITI/pharm/...MedicationOverviewBundle URL was a placeholder.
    Then "bundleResult" conforms to "https://profiles.ihe.net/PHARM/MEOW/StructureDefinition/MedicationOverview"
