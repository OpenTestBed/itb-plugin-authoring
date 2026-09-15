Feature: Generate a test Bundle from data rows

  Background:
    Given Client is the system under test
    And FHIRServer is infrastructure
    And FHIRServer is configured

  Scenario: Generate Patient bundle
    Given set $bundleData to data:
      | familyName | givenName | sex    |
      | Doe        | John      | male   |
      | Smith      | Jane      | female |
      | Wilson     | Bob       | male   |
    And generate test bundle from profile "http://hl7.org/fhir/StructureDefinition/Patient" with data "bundleData"
    Then $generatedBundle at "Bundle.entry.count()" should be 3
