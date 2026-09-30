# IHE ITI Internet User Authorization (IUA), Revision 2.5, Trial Implementation,
# 18 June 2026 — https://profiles.ihe.net/ITI/IUA/index.html
#
# Actor: Authorization Client. Required: Get Access Token [ITI-71] and
# Incorporate Access Token [ITI-72]. Optional: Get Authorization Server
# Metadata [ITI-103].
#
# THE SHAPE IS INVERTED. A client initiates, so there is nothing to send it.
# The test bed plays the Authorization Server and the Resource Server, waits to
# be called, and asserts on what arrives. That has three consequences worth
# knowing before reading further:
#
#   1. Every scenario needs the client POINTED AT THE TEST BED, not at a real
#      authorization server. The operator does that once per run, from the
#      endpoints the test bed prints when the session starts, and then triggers
#      the client. Each scenario says what to trigger.
#   2. The tokens are ours. The test bed mints an opaque token per scenario and
#      hands it back, so "the client sent the token it was given" is a literal
#      string comparison rather than an inference.
#   3. A simulated reply carries no custom headers — the language can set a
#      status and a body, nothing else. Where a real server would answer 401
#      with a WWW-Authenticate challenge, these scenarios answer with the bare
#      status. AC-04 says what that costs.
#
# The oauth dialect is not used here: nothing in this file sends a form body.
# What arrives is inspected with the core's assertions on $received.
@lang:itb-core-en@^2
Feature: IUA Authorization Client — Get and Incorporate Access Token [ITI-71, ITI-72]
  An Authorization Client obtains an access token and presents it on the
  requests it makes. These scenarios establish that it asks correctly, that it
  carries the token it was given, and that it does not leak it.

  Background:
    Given AuthorizationClient is the system under test at "https://client.example.org" as defined by "https://profiles.ihe.net/ITI/IUA/index.html"
    And AuthorizationServer is infrastructure
    And ResourceServer is infrastructure

  # ==================================================================
  # ITI-71 — asking for a token
  # ==================================================================

  # AC-01 — ITI-71. What a token request must look like: a POST, form encoded,
  # carrying a grant_type, with the client authenticated. The profile does not
  # mandate which client authentication method, so the assertion is that some
  # credential is present rather than that it is Basic.
  Scenario: AC-01 the client requests a token as a form-encoded POST with client authentication
    Given AuthorizationServer is listening for AuthorizationClient
    And AuthorizationClient is informed "Point your client's token endpoint at the Authorization Server address shown for this session, then trigger it to obtain an access token."
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    Then $received.method should be "POST"
    And $received.headers.Content-Type should contain "application/x-www-form-urlencoded"
    And $received.body should contain "grant_type="
    And $received.headers.Authorization should not be empty
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac01-issued-token","scope":"patient/*.read","expires_in":3600}
      """
    And AuthorizationServer stops listening for AuthorizationClient

  # ==================================================================
  # ITI-72 — presenting the token
  # ==================================================================

  # AC-02 — ITI-72. The token the client presents must be the token it was
  # issued. The test bed issues a known string, so this is an exact comparison:
  # a client that reuses a stale token, or mangles the one it got, fails here.
  Scenario: AC-02 the client presents the issued token as a bearer credential
    Given AuthorizationServer is listening for AuthorizationClient
    And ResourceServer is listening for AuthorizationClient
    And AuthorizationClient is informed "Point both the token endpoint and the resource endpoint at the addresses shown for this session, then trigger a request for a protected resource."
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac02-issued-token","scope":"patient/*.read","expires_in":3600}
      """
    And ResourceServer receives a request from AuthorizationClient within 120 seconds
    Then $received.headers.Authorization should be "Bearer ac02-issued-token"
    And ResourceServer replies to AuthorizationClient with status 200 and:
      """
      {"resourceType":"Patient","id":"example"}
      """
    And AuthorizationServer stops listening for AuthorizationClient
    And ResourceServer stops listening for AuthorizationClient

  # ==================================================================
  # Security boundary
  # ==================================================================

  # AC-03 — security boundary. A token issued for one Resource Server must not
  # be presented to another. This is the one case where the assertion is that
  # something is ABSENT, so read it carefully: it establishes that the token
  # this test issued did not reach the foreign server. A client that sends some
  # other credential there still passes, which is correct — the profile does not
  # forbid the client having other credentials.
  Scenario: AC-03 the client does not present the token to a server outside its audience
    Given ForeignServer is infrastructure
    And AuthorizationServer is listening for AuthorizationClient
    And ForeignServer is listening for AuthorizationClient
    And AuthorizationClient is informed "Trigger a request for a protected resource, then trigger a request to the second, unrelated resource endpoint shown for this session."
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac03-audience-bound-token","scope":"patient/*.read","aud":"https://rs.example.org","expires_in":3600}
      """
    And ForeignServer receives a request from AuthorizationClient within 120 seconds
    Then $received.headers.Authorization should not contain "ac03-audience-bound-token"
    And ForeignServer replies to AuthorizationClient with status 404 and:
      """
      {"resourceType":"OperationOutcome"}
      """
    And AuthorizationServer stops listening for AuthorizationClient
    And ForeignServer stops listening for AuthorizationClient

  # ==================================================================
  # Reacting to a refusal
  # ==================================================================

  # AC-04 — ITI-71 with ITI-72. A client that meets a 401 should obtain a fresh
  # token rather than replay the rejected one. Two rounds: the test bed issues
  # a first token, refuses it, and then checks that what comes back the second
  # time is the second token and not the first.
  #
  # TWO RESERVATIONS, stated rather than hidden:
  #
  #   - The 401 carries no WWW-Authenticate challenge, because a simulated reply
  #     cannot set headers. A client that only re-authenticates when it sees the
  #     challenge will fail this scenario for the wrong reason. If that happens,
  #     it is this test that is wrong, not the client.
  #   - A conformant client may legitimately give up after a 401 instead of
  #     retrying; the profile does not require a retry. So a timeout on the
  #     second token request is inconclusive, not a failure. This scenario is
  #     the most likely of the five to need rewriting as an operator attestation.
  Scenario: AC-04 after a 401 the client obtains a fresh token rather than replaying
    Given AuthorizationServer is listening for AuthorizationClient
    And ResourceServer is listening for AuthorizationClient
    And AuthorizationClient is informed "Trigger a request for a protected resource, and leave the client running so it can react to a refusal."
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac04-first-token","scope":"patient/*.read","expires_in":3600}
      """
    And ResourceServer receives a request from AuthorizationClient within 120 seconds
    Then $received.headers.Authorization should be "Bearer ac04-first-token"
    And ResourceServer replies to AuthorizationClient with status 401 and:
      """
      {"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"login"}]}
      """
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac04-second-token","scope":"patient/*.read","expires_in":3600}
      """
    And ResourceServer receives a request from AuthorizationClient within 120 seconds
    Then $received.headers.Authorization should be "Bearer ac04-second-token"
    And ResourceServer replies to AuthorizationClient with status 200 and:
      """
      {"resourceType":"Patient","id":"example"}
      """
    And AuthorizationServer stops listening for AuthorizationClient
    And ResourceServer stops listening for AuthorizationClient

  # ==================================================================
  # Option: Authorization Server Metadata [ITI-103]
  # ==================================================================

  # AC-05 — ITI-103, RFC 8414. Only applies with the Authorization Server
  # Metadata Option. The client is given only the issuer, so the only way it can
  # find the token endpoint is to fetch the metadata — and the metadata this
  # test serves points the token endpoint somewhere the client was never told
  # about. Arriving there is the proof that discovery happened.
  Scenario: AC-05 the client discovers the token endpoint from the metadata document
    Given AuthorizationServer is listening for AuthorizationClient
    And AuthorizationClient is informed "Configure your client with ONLY the issuer URL shown for this session — no token endpoint — then trigger it to obtain an access token."
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    Then $received.path should contain "/.well-known/oauth-authorization-server"
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"issuer":"https://as.example.org","token_endpoint":"https://as.example.org/discovered/token","authorization_endpoint":"https://as.example.org/authorize","grant_types_supported":["client_credentials","authorization_code"],"code_challenge_methods_supported":["S256"]}
      """
    When AuthorizationServer receives a request from AuthorizationClient within 120 seconds
    Then $received.path should contain "/discovered/token"
    And $received.body should contain "grant_type="
    And AuthorizationServer replies to AuthorizationClient with status 200 and:
      """
      {"token_type":"Bearer","access_token":"ac05-issued-token","scope":"patient/*.read","expires_in":3600}
      """
    And AuthorizationServer stops listening for AuthorizationClient
