# IHE ITI Internet User Authorization (IUA), Revision 2.5, Trial Implementation,
# 18 June 2026 — https://profiles.ihe.net/ITI/IUA/index.html
#
# Actor: Resource Server. Required transaction: Incorporate Access Token
# [ITI-72]. Optional: Introspect Token [ITI-102], Get Authorization Server
# Metadata [ITI-103].
#
# The profile's testable substance for this actor is what it must REFUSE. Volume
# 2 states four obligations, and each one below quotes the SHALL it covers:
#
#   "The Resource Server shall validate or introspect the access token and
#    ensure that it has not expired."
#   "If the token includes a scope claim, the Resource Server shall verify that
#    the scope covers the transaction to the requested resource."
#   "If the token includes an audience claim, the Resource Server shall verify
#    that the audience includes the Resource Server itself."
#   "The Resource Server shall verify that the claims conveyed in the access
#    token match the transaction type and data."
#
# HOW THE TOKENS GET HERE. A Resource Server test needs tokens it did not issue:
# a valid one, an expired one, one for another audience, one with a narrow
# scope. Minting them requires a signing key, so they are supplied as run-time
# parameters rather than generated in the test — the operator pastes each one
# once, and the scenarios consume them. That is a deliberate trade: it keeps the
# suite runnable against any Authorization Server, at the cost of manual setup.
@lang:itb-core-en@^2 @dialect:fhir-validator@^2 @dialect:jwt@^1
Feature: IUA Resource Server — Incorporate Access Token [ITI-72]
  A Resource Server polices the access token before it serves anything. These
  scenarios establish that it serves a request carrying a good token, and that
  it refuses every case the profile says it must.

  Background:
    Given ResourceServer is the system under test at "https://rs.example.org" as defined by "https://profiles.ihe.net/ITI/IUA/index.html"
    And FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
    And Client is infrastructure

    # The four tokens the scenarios need. Each is pasted once per run.
    Given Client is asked for $validToken with "Paste a currently valid access token for this Resource Server"
    And Client is asked for $expiredToken with "Paste an access token that has expired"
    And Client is asked for $otherAudienceToken with "Paste a token issued for a DIFFERENT Resource Server"
    And Client is asked for $narrowScopeToken with "Paste a token whose scope does NOT cover the protected resource"
    And Client is asked for $protectedResource with "Path of a protected resource, relative to the base and with no leading slash, e.g. Patient/example"

  # ==================================================================
  # Positive
  # ==================================================================

  # RS-01 — ITI-72. The baseline: a good token gets the resource.
  Scenario: RS-01 a request carrying a valid access token returns the resource
    Given set bearer token from $validToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $resource
    Then $response.status should be 200
    And $resource should not be empty

  # ==================================================================
  # Negative — what the profile says it SHALL refuse
  # ==================================================================

  # RS-02 — "shall validate or introspect the access token and ensure that it
  # has not expired".
  Scenario: RS-02 an expired access token is refused
    Given set bearer token from $expiredToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # RS-03 — "shall verify that the audience includes the Resource Server
  # itself". Distinct from RS-07: this token names some other audience, where
  # RS-07 names a sibling Resource Server in the same deployment.
  Scenario: RS-03 a token whose audience excludes this server is refused
    Given set bearer token from $otherAudienceToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # RS-04 — "shall verify that the scope covers the transaction to the
  # requested resource".
  Scenario: RS-04 a token whose scope does not cover the resource is refused
    Given set bearer token from $narrowScopeToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # RS-05 — ITI-72. No token at all. The profile assumes a token is present;
  # refusing its absence is the floor beneath every other case here.
  Scenario: RS-05 a request with no Authorization header is refused
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # RS-06 — ITI-72. A syntactically broken credential, as opposed to a
  # well-formed token that fails a check.
  Scenario: RS-06 a malformed Authorization header is refused
    Given set header "Authorization" to "Bearer not-a-token"
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # ==================================================================
  # Security boundary
  # ==================================================================

  # RS-07 — ITI-72 audience. A token minted for a sibling Resource Server in
  # the same deployment is the realistic confusion, and the one an audience
  # check exists to catch.
  Scenario: RS-07 a token issued for a sibling Resource Server is refused
    Given Client is asked for $siblingToken with "Paste a token issued for another Resource Server in this same deployment"
    And set bearer token from $siblingToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401

  # ==================================================================
  # Error-response shape
  # ==================================================================

  # RS-08 — RFC 6750 §3, which OAuth 2.1 carries forward: a 401 from a
  # protected resource carries a WWW-Authenticate challenge. A bare 401 with no
  # challenge leaves a client unable to tell what to do next.
  Scenario: RS-08 the refusal carries a WWW-Authenticate challenge
    Given set bearer token from $expiredToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $refused
    Then $response.status should be 401
    And $response.headers.WWW-Authenticate should contain "Bearer"

  # ==================================================================
  # Claims match the transaction
  # ==================================================================

  # RS-09 — "shall verify that the claims conveyed in the access token match
  # the transaction type and data". The profile does not say which claims bind
  # to which transaction, so this cannot be asserted from outside: the same 200
  # is returned whether the server checked or not. What the test CAN do is
  # establish that the token it accepted really did carry claims consistent with
  # the request, and put the judgement to the operator.
  Scenario: RS-09 the accepted token's claims match the transaction
    Given set bearer token from $validToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $resource
    Then $response.status should be 200
    When Client decodes the JWT $validToken as $claims
    Then $claims at "/aud" should contain "https://rs.example.org"
    And $claims at "/scope" should not be empty
    And ResourceServer confirms each of these is displayed:
      | item                                                                  |
      | The scope in the token covers the resource that was returned          |
      | The subject in the token is the user the returned data belongs to      |

  # ==================================================================
  # Option: Token Introspection [ITI-102]
  # ==================================================================

  # RS-10 — ITI-102. Only applies when the Resource Server implements the Token
  # Introspection Option; the actor table makes ITI-102 required only then. A
  # server that validates the token locally instead is conformant and will fail
  # this scenario, so read it as option-gated rather than as a defect.
  #
  # Introspection happens between the Resource Server and the Authorization
  # Server, so it is not observable from the client side. The operator confirms
  # it from the Authorization Server's log.
  Scenario: RS-10 the server introspects the token before serving
    Given ResourceServer is informed "Clear the Authorization Server introspection log, then continue"
    And set bearer token from $validToken
    When Client gets from ResourceServer at "/" with id $protectedResource as $resource
    Then $response.status should be 200
    And ResourceServer confirms each of these is displayed:
      | item                                                                        |
      | The Authorization Server log shows an introspection call for this token     |
