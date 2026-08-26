@lang:itb-core-en@^1.2 @dialect:fhir-validator@^1.0
Feature: IHE MEOW Medication Overview Responder — server-side conformance-demo
  Background:
    Given MedicationOverviewResponder is the system under test at "http://meow-responder:8080/fhir" as defined by "https://profiles.ihe.net/PHARM/MEOW/CapabilityStatement/MedicationOverviewResponder"
    And MedicationOverviewConsumer is infrastructure as defined by "https://profiles.ihe.net/PHARM/MEOW/CapabilityStatement/MedicationOverviewConsumer"
    And FHIRValidator is infrastructure at "http://fhir-validator:8080"

  Scenario: tc-meow-server-001 PHARM-11 query by patient returns treatment lines
    When MedicationOverviewConsumer loads IG "https://profiles.ihe.net/PHARM/MEOW/package.tgz" on FHIRValidator
    Then "response status" should be "200"
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/MedicationStatement?patient=meow-test-patient" as "lines"
    Then "response status" should be "200"
    And "lines" should not be empty
    And evaluate FHIRPath "Bundle.type" on "lines" and expect "searchset"
    And evaluate FHIRPath "Bundle.entry.exists()" on "lines" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.all($this is MedicationStatement)" on "lines" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.subject.reference.all(endsWith('meow-test-patient'))" on "lines" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.meta.profile.where($this.startsWith('https://profiles.ihe.net/PHARM/MEOW/StructureDefinition/MedicationTreatmentLine')).exists()" on "lines" and expect "true"

  Scenario: tc-meow-server-002 PHARM-11 honours the optional search parameters
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/MedicationStatement?patient=meow-test-patient&status=active" as "activeLines"
    Then "response status" should be "200"
    And evaluate FHIRPath "Bundle.type" on "activeLines" and expect "searchset"
    And evaluate FHIRPath "Bundle.entry.resource.all(status = 'active')" on "activeLines" and expect "true"
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/MedicationStatement?patient=meow-test-patient&category=community" as "categoryLines"
    Then "response status" should be "200"
    And evaluate FHIRPath "Bundle.type" on "categoryLines" and expect "searchset"
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/MedicationStatement?patient=meow-test-patient&_lastUpdated=gt2999-01-01" as "futureLines"
    Then "response status" should be "200"
    And evaluate FHIRPath "Bundle.type" on "futureLines" and expect "searchset"
    And evaluate FHIRPath "Bundle.entry.exists()" on "futureLines" and expect "false"

  Scenario: tc-meow-server-003 PHARM-11 rejects a query without the required patient
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/MedicationStatement" as "unscoped"
    Then "response status" should be "400"
    And evaluate FHIRPath "OperationOutcome.issue.exists()" on "unscoped" and expect "true"
    And evaluate FHIRPath "OperationOutcome.issue.where(severity in ('error' | 'fatal')).exists()" on "unscoped" and expect "true"

  Scenario: tc-meow-server-004 PHARM-12 returns a conformant MedicationOverview
    When MedicationOverviewConsumer loads IG "https://profiles.ihe.net/PHARM/MEOW/package.tgz" on FHIRValidator
    Then "response status" should be "200"
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/Bundle?patient=meow-test-patient&type=document" as "docSearch"
    Then "response status" should be "200"
    And evaluate FHIRPath "Bundle.type" on "docSearch" and expect "searchset"
    And evaluate FHIRPath "Bundle.entry.exists()" on "docSearch" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.all($this is Bundle)" on "docSearch" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.all(type = 'document')" on "docSearch" and expect "true"
    When MedicationOverviewConsumer gets from MedicationOverviewResponder at "/Bundle/meow-test-overview" as "overview"
    Then "response status" should be "200"
    And evaluate FHIRPath "Bundle.type" on "overview" and expect "document"
    And "overview" conforms to "https://profiles.ihe.net/PHARM/MEOW/StructureDefinition/MedicationOverview"
    And evaluate FHIRPath "Bundle.entry.resource.ofType(Composition).count()" on "overview" and expect "1"
    And evaluate FHIRPath "Bundle.entry.resource.ofType(Patient).exists()" on "overview" and expect "true"
    And evaluate FHIRPath "Bundle.entry.resource.ofType(MedicationStatement).exists()" on "overview" and expect "true"
