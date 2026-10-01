# IHE ITI Internet User Authorization (IUA), Revision 2.5, Trial Implementation,
# 18 June 2026 — https://profiles.ihe.net/ITI/IUA/index.html
#
# Actor: Authorization Server. Required transaction: Get Access Token [ITI-71].
# Optional: Introspect Token [ITI-102], Get Authorization Server Metadata
# [ITI-103]. ITI-102 becomes required with the Token Introspection Option.
#
# ITI-71 carries two flows. The client-credentials flow is one POST and is fully
# automatable. The authorization-code flow needs a user at a browser to
# authenticate and consent, so its scenarios hand the interactive part to the
# operator and assert on what comes back.
#
# TWO DIALECTS BEYOND THE CORE, both added for this suite:
#
#   oauth  a token endpoint takes application/x-www-form-urlencoded, and the
#          core's POST verbs fix Content-Type to application/json inside the
#          verb. A form body also has to be assembled from run-time values — an
#          authorization code, a PKCE verifier — which the core's {value} slot
#          cannot express. Neither is something an author can work around.
#   jwt    the JWT Token Option cases decode the issued token. Decoding borrows
#          the FHIR validator's FHIRPath endpoint; see
#          itb-plugin-jwt/dialect/component.yml for why, and for what it rests on.
@lang:itb-core-en@^2 @dialect:oauth@^1 @dialect:fhir-validator@^2 @dialect:jwt@^1
Feature: IUA Authorization Server — Get Access Token [ITI-71]
  An Authorization Server issues access tokens and refuses bad requests in the
  way OAuth 2.1 prescribes. These scenarios establish both, and inspect the
  issued token when the JWT Token Option is claimed.

  Background:
    Given AuthorizationServer is the system under test at "https://as.example.org" as defined by "https://profiles.ihe.net/ITI/IUA/index.html"
    And FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
    And Client is infrastructure

    # Client registration is out of band, so the credentials are supplied. The
    # oauth verbs leave the Authorization header alone, so client
    # authentication is set the ordinary way, once, here.
    Given Client is asked for $clientAuth with "Paste the HTTP Basic credentials for a registered client, as 'Basic <base64>'"
    And Client is asked for $resourceId with "The Resource Server endpoint identifier to request a token for"
    And set header "Authorization" to $clientAuth

  # ==================================================================
  # Positive — client credentials
  # ==================================================================

  # AS-01 — ITI-71. The required response fields: token_type, access_token and
  # scope. expires_in and refresh_token are optional and not asserted.
  Scenario: AS-01 a client-credentials grant returns a bearer token and its scope
    When Client requests a token from AuthorizationServer at "/token" with grant "client_credentials" and scope "patient/*.read"
    Then $response.status should be 200
    And extract "/token_type" from $response.body as $tokenType
    And $tokenType should be "Bearer"
    And extract "/access_token" from $response.body as $accessToken
    And $accessToken should not be empty
    And extract "/scope" from $response.body as $grantedScope
    And $grantedScope should not be empty

  # ==================================================================
  # Positive — authorization code with PKCE
  # ==================================================================

  # AS-02 — ITI-71 authorization code flow. The authorization endpoint needs a
  # human: the profile requires code_challenge, and the user authenticates at
  # the Authorization Server's own screens. The operator drives that and brings
  # back the code, which the test then exchanges.
  Scenario: AS-02 an authorization-code grant with PKCE returns an access token
    Given Client is asked for $codeVerifier with "A PKCE code_verifier you generated (43-128 characters)"
    And AuthorizationServer is informed "Open the authorization endpoint with response_type=code, your client_id, a state, and the code_challenge for that verifier. Authenticate, consent, and copy the code from the redirect."
    And Client is asked for $authCode with "Paste the authorization code from the redirect"
    When Client exchanges the code $authCode for a token on AuthorizationServer at "/token" with verifier $codeVerifier
    Then $response.status should be 200
    And extract "/access_token" from $response.body as $codeToken
    And $codeToken should not be empty

  # ==================================================================
  # Option: JWT Token — the claims the profile requires
  # ==================================================================

  # AS-03 — ITI-71 JWT Token Option. Volume 2 lists the required claims: iss,
  # sub, client_id, aud, jti, exp, iat and scope. nbf is optional.
  Scenario: AS-03 the issued JWT carries every required claim
    When Client requests a token from AuthorizationServer at "/token" with grant "client_credentials" and scope "patient/*.read"
    Then $response.status should be 200
    And extract "/access_token" from $response.body as $jwt
    And $jwt should be a well-formed JWT
    When Client decodes the JWT $jwt as $claims
    Then $claims at "/iss" should not be empty
    And $claims at "/sub" should not be empty
    And $claims at "/client_id" should not be empty
    And $claims at "/aud" should not be empty
    And $claims at "/jti" should not be empty
    And $claims at "/exp" should not be empty
    And $claims at "/iat" should not be empty
    And $claims at "/scope" should not be empty

  # AS-04 — ITI-71 JWT Token Option. exp and iat are NumericDate, epoch seconds.
  # A token already expired, or issued in the future, is unusable whatever else
  # it carries. The comparison is put to the operator rather than computed: TDL
  # has no epoch-seconds clock to compare against, and a clock difference
  # between the test bed and the Authorization Server is itself a real fault
  # that an automated comparison would report as the wrong defect.
  Scenario: AS-04 the issued JWT expires in the future and was issued in the past
    When Client requests a token from AuthorizationServer at "/token" with grant "client_credentials" and scope "patient/*.read"
    Then $response.status should be 200
    And extract "/access_token" from $response.body as $jwt
    When Client decodes the JWT $jwt as $claims
    Then $claims at "/exp" should not be empty
    And $claims at "/iat" should not be empty
    And AuthorizationServer confirms each of these is displayed:
      | item                                          |
      | exp, read as epoch seconds, is later than now |
      | iat, read as epoch seconds, is not later than now |

  # AS-05 — ITI-71. The `resource` parameter names the Resource Server the token
  # is for, and the aud claim is how the Resource Server checks it. If aud does
  # not reflect the request, every audience check downstream is meaningless.
  Scenario: AS-05 the audience claim names the requested resource
    When Client requests a token from AuthorizationServer at "/token" with grant "client_credentials" and scope "patient/*.read" for resource $resourceId
    Then $response.status should be 200
    And extract "/access_token" from $response.body as $jwt
    When Client decodes the JWT $jwt as $claims
    Then $claims at "/aud" should contain $resourceId

  # ==================================================================
  # Negative — OAuth 2.1 §5.3 error responses
  # ==================================================================

  # AS-06 — OAuth 2.1 §5.3. A grant type the server does not support.
  Scenario: AS-06 an unsupported grant type is refused as unsupported_grant_type
    When Client requests a token from AuthorizationServer at "/token" with grant "urn:example:no-such-grant"
    Then $response.status should be 400
    And $response.body should be the OAuth error "unsupported_grant_type"

  # AS-07 — OAuth 2.1 §5.3. Client authentication that does not authenticate.
  # The status may be 400 or 401 depending on how the server challenges, so the
  # error code carries the assertion. The Background's good credentials are
  # replaced for this scenario only.
  Scenario: AS-07 bad client credentials are refused as invalid_client
    Given set header "Authorization" to "Basic bm90LWEtY2xpZW50Om5vdC1hLXNlY3JldA=="
    When Client requests a token from AuthorizationServer at "/token" with grant "client_credentials"
    Then $response.status should be at least 400
    And $response.body should be the OAuth error "invalid_client"

  # AS-08 — OAuth 2.1. An authorization code is single-use. Replaying one is the
  # attack the rule exists to stop.
  Scenario: AS-08 a replayed authorization code is refused as invalid_grant
    Given Client is asked for $usedCode with "Paste an authorization code that has ALREADY been exchanged once"
    And Client is asked for $usedVerifier with "The code_verifier that went with it"
    When Client exchanges the code $usedCode for a token on AuthorizationServer at "/token" with verifier $usedVerifier
    Then $response.status should be 400
    And $response.body should be the OAuth error "invalid_grant"

  # AS-09 — ITI-71 PKCE. Without the verifier, possession of the code alone must
  # not be enough. The verifier slot is simply left off, so no code_verifier
  # parameter is sent at all.
  Scenario: AS-09 a code exchanged without its verifier is refused as invalid_grant
    Given Client is asked for $freshCode with "Paste a fresh, unused authorization code obtained with a code_challenge"
    When Client exchanges the code $freshCode for a token on AuthorizationServer at "/token"
    Then $response.status should be 400
    And $response.body should be the OAuth error "invalid_grant"

  # AS-10 — OAuth 2.1 §5.3. The shape, not just the status: a JSON body with an
  # `error` member. A 400 carrying HTML tells a client nothing it can act on.
  # The request is malformed outright — no grant_type — which every server must
  # reject however else it is configured.
  Scenario: AS-10 an error response is JSON carrying an error member
    When Client posts form-encoded to AuthorizationServer at "/token" with:
      """
      scope=patient%2F%2A.read
      """
    Then $response.status should be at least 400
    And $response.headers.Content-Type should contain "application/json"
    And $response.body should carry an OAuth error code

  # ==================================================================
  # Option: Authorization Server Metadata [ITI-103]
  # ==================================================================

  # AS-11 — ITI-103, RFC 8414. Only applies with the Authorization Server
  # Metadata Option. A server without it will fail this; that is the option
  # being absent, not a defect.
  Scenario: AS-11 the metadata document declares the token endpoint
    When Client gets from AuthorizationServer at "/.well-known/oauth-authorization-server" as $metadata
    Then $response.status should be 200
    And $metadata at "/token_endpoint" should not be empty
    And $metadata at "/issuer" should not be empty

  # ==================================================================
  # Option: Token Introspection [ITI-102]
  # ==================================================================

  # AS-12 — ITI-102. Only applies with the Token Introspection Option. The
  # Resource Server authenticates to the introspection endpoint with its own
  # credentials, which are separate from the client's, so the Authorization
  # header set in the Background is replaced here.
  Scenario: AS-12 introspecting a valid token reports it active with its scope
    Given Client is asked for $rsAuth with "Paste the Resource Server's HTTP Basic credentials for the introspection endpoint, as 'Basic <base64>'"
    And Client is asked for $liveToken with "Paste a currently valid access token to introspect"
    And set header "Authorization" to $rsAuth
    When Client introspects the token $liveToken on AuthorizationServer at "/introspect" as $introspection
    Then $response.status should be 200
    And $introspection at "/active" should be true
    And $introspection at "/scope" should not be empty

  # AS-13 — ITI-102. "The introspection response for inactive tokens omits
  # privacy/security-sensitive claims and does not indicate why the token was
  # marked inactive." So the assertion is as much about what is absent as about
  # active being false.
  Scenario: AS-13 introspecting an expired token reports inactive and withholds claims
    Given Client is asked for $rsAuth with "Paste the Resource Server's HTTP Basic credentials for the introspection endpoint, as 'Basic <base64>'"
    And Client is asked for $deadToken with "Paste an access token that has expired"
    And set header "Authorization" to $rsAuth
    When Client introspects the token $deadToken on AuthorizationServer at "/introspect" as $introspection
    Then $response.status should be 200
    And $introspection at "/active" should be false
    And $introspection at "/sub" should not exist
    And $introspection at "/scope" should not exist
