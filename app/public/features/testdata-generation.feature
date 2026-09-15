Feature: Test data generation with data tables

  Background:
    Given Client is the system under test
    And FHIRServer is infrastructure
    And FHIRValidator is a fhir-validator
    And FHIRValidator is loaded with package "hl7.fhir.us.core#5.0.1"

  Scenario: Generate and validate Patient test data
    Given set $mappings to mappings:
      | path              | expression              |
      | Patient.name      | column('familyName')    |
      | Patient.gender    | column('sex')           |
    And set $data to data:
      | familyName | sex    |
      | Doe        | male   |
    And generate test data from profile "http://hl7.org/fhir/StructureDefinition/Patient" with mappings "mappings" and data "data"
    Then Client validates $generatedResource against "http://hl7.org/fhir/StructureDefinition/Patient"
    And $validation.errors should be 0
    And $generatedResource at "Patient.name.family" should be "Doe"
