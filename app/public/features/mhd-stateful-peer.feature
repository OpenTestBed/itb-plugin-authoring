# Proof of the stateful-peer pattern: a real FHIR server standing in for a
# simulator, with ITB doing the orchestration.
#
# The question this answers: Gazelle builds a Quarkus simulator to play the
# peer actor. Does ITB need one? For any test whose peer must HOLD STATE
# rather than assert on an inbound request — no. Declare a real server as
# infrastructure, seed it, act on it, and query it back. Ordinary requests in
# both directions: no <receive>, no reply, no transaction correlation.
#
# Every request below was executed by hand against hapi.fhir.org before the
# assertions were written, so the expected values are observed, not assumed.
@lang:itb-core-en@^1.5 @dialect:fhir-validator@^1.0
Feature: MHD stateful peer — seed, act, verify against a real server
  Exercises the CH:MHD-1 shape (create a DocumentReference, update only its
  description, confirm the change landed) against a live FHIR server, to
  establish that the peer does not have to be purpose-built software.

  Background:
    Given DocumentResponder is the system under test at "https://hapi.fhir.org/baseR4" as defined by "https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.DocumentResponder"
    And DocumentSource is infrastructure as defined by "https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.DocumentSource"
    And set header "Accept" to "application/fhir+json"

  Scenario: mhd-peer-001 the description can be updated and nothing else moves

    # ------------------------------------------------------------------
    # Seed. A client-assigned id via PUT, deliberately: the update below
    # needs the id INSIDE the body as well as in the path, and a docstring
    # body is a literal — so a server-assigned id could not be written into
    # it. Chaining a server-assigned id works for paths (see
    # mhd-document-responder.feature) but not for bodies.
    #
    # The status of this step is NOT asserted. PUT-with-id returns 201 the
    # first time and 200 on every run after, so an exact-status assertion
    # here would pass once and then fail forever. The seed is a
    # precondition; the assertions that matter come after it.
    # ------------------------------------------------------------------
    When DocumentSource puts to DocumentResponder at "/DocumentReference/otb-mhd-probe-001" with:
      """
      {
        "resourceType": "DocumentReference",
        "id": "otb-mhd-probe-001",
        "status": "current",
        "description": "Original description for -MedicationCard",
        "content": [{ "attachment": { "contentType": "application/pdf" } }]
      }
      """

    # ------------------------------------------------------------------
    # The peer is holding state — read it back and prove it.
    # ------------------------------------------------------------------
    When DocumentSource gets from DocumentResponder at "/DocumentReference/otb-mhd-probe-001" as "seeded"
    Then "response status" should be "200"
    And evaluate FHIRPath "DocumentReference.description" on "seeded" and expect "Original description for -MedicationCard"
    And evaluate FHIRPath "DocumentReference.status" on "seeded" and expect "current"

    # ------------------------------------------------------------------
    # CH:MHD-1 Update Document Metadata — change the description only.
    # This one IS deterministic: the resource exists by now, so an update
    # is always 200.
    # ------------------------------------------------------------------
    When DocumentSource puts to DocumentResponder at "/DocumentReference/otb-mhd-probe-001" with:
      """
      {
        "resourceType": "DocumentReference",
        "id": "otb-mhd-probe-001",
        "status": "current",
        "description": "Corrected description for -MedicationCard",
        "content": [{ "attachment": { "contentType": "application/pdf" } }]
      }
      """
    Then "response status" should be "200"

    # ------------------------------------------------------------------
    # Verify by querying the peer, not by trusting the response.
    # ------------------------------------------------------------------
    When DocumentSource gets from DocumentResponder at "/DocumentReference/otb-mhd-probe-001" as "updated"
    Then "response status" should be "200"
    And evaluate FHIRPath "DocumentReference.description" on "updated" and expect "Corrected description for -MedicationCard"

    # The update must not have disturbed anything else.
    And evaluate FHIRPath "DocumentReference.status" on "updated" and expect "current"
    And evaluate FHIRPath "DocumentReference.content.attachment.contentType" on "updated" and expect "application/pdf"

    # A new version exists — the server really wrote, rather than accepting
    # and discarding.
    And evaluate FHIRPath "DocumentReference.meta.versionId.toInteger() > 1" on "updated" and expect "true"
