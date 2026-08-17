# =============================================================================
# tng-certificate-governance.feature
#
# WHO GDHCN certificate governance, written in the **certificate dialect** —
# a Gherkin step language whose vocabulary and semantics are implemented by
# tng_certificate_dialect.py in the tng-participant-DEV-XXR repository.
#
# The dialect deliberately contains NO Feature/Scenario/Rule parsing. It takes a
# step's text plus its data table and evaluates them against certificate facts,
# so it binds to an ITB base parser, to behave, or to pytest-bdd equally well.
# Every step below is one of its 23 definitions.
#
# WHERE THE FACTS COME FROM
#   The dialect reads facts from `describe_cert` — the same module the rule
#   engine uses, so a step and a rule can never disagree about what a
#   certificate contains. Over HTTP those facts come from:
#
#       POST /{domain}/api/inspect
#       {"layout":"participant","country":"XXR"}            → every certificate
#       {"layout":"participant","group":"TLS","filename":"TLS.pem"}  → one
#
#   That endpoint reports what a certificate IS, not whether it passes. The
#   rules answer "does this pass?"; a step such as
#   `"cert" keyUsage "cRLSign" must be false` needs the *value*.
#
# DIVERGENCE FROM THE CANONICAL FEATURE
#   This copy adds three core-language lines to Background — SUT actor,
#   TNGValidator endpoint, and the participant country. The canonical copy in
#   tng-participant-DEV-XXR omits them, because the Python dialect knows only
#   its own 23 steps and would report core-language steps as UNKNOWN.
#   Every certificate-dialect step below is byte-identical between the two.
#
#   Change the endpoint to wherever the TNG trust service actually runs. The
#   generated suite reads it as $TNGValidatorBase.
#
# EXECUTION MODEL — read this before wiring it up
#   The unit of execution is ONE SCENARIO RUN PER CERTIFICATE. Bind the subject
#   once, reuse the binding for every step in that scenario (that is where
#   "tlsCert" and "caCert" live), and run the whole feature once per subject.
#
#   SKIPPED IS NOT PASSED. Most scenarios below open with a guard, so for any
#   one certificate most of them do not apply. A harness that reported SKIPPED
#   as a pass would be claiming that every UPLOAD certificate satisfies every
#   TLS rule.
#
#   UNKNOWN (no step definition matched) must fail loudly too. The source spec
#   criticises "assertions that don't yet check anything"; a harness that
#   shrugged at unrecognised text would reintroduce exactly that.
#
# TAGS
#   @enforced  the /validate rule engine enforces this too — the two agree
#   @proposed  the dialect checks it, the rule engine does not (yet). These are
#              governance decisions, not defects.
#
# VERIFIED OUTCOMES against the reference material (PH4H, participant XXR:
# SCA/SCA.pem, TLS/CA.pem, TLS/TLS.pem, UP/UP.pem):
#
#       passed 36   failed 1   skipped 35   unknown 0
#
#   The single failure is intentional and documents a real gap:
#
#       @proposed  The CA in a TLS group is a CA
#            FAIL  TLS/CA.pem  basicConstraints is CA:False, expected CA:True
#
#   That material ships CA.pem byte-identical to TLS.pem, so it carries
#   CA:FALSE. The rule engine never reaches that branch; the dialect does.
#   Running this feature is what makes the difference visible.
#
# Thresholds match rules.yaml 1.0.0 (SCA and DECA 4 years, everything else 2).
# =============================================================================
@certificates @governance @GDHCN
Feature: WHO GDHCN certificate governance
  Every certificate in a participant's onboarding material must satisfy the
  governance rules for the role its folder places it in.

  Background:
    # --- ITB wiring (core language, not the certificate dialect) ------------
    # These three lines are what this copy adds over the canonical feature in
    # tng-participant-DEV-XXR. Without them the generated suite falls back to
    # the default Client/FHIRServer actors, $TNGValidatorBase is declared but
    # never assigned, and every send resolves to a relative URI and fails.
    Given Participant is the system under test
    And TNGValidator is infrastructure at "http://tng-trust-service:8080"
    And set "tngCountry" to "XXR"
    # --- the certificate dialect proper -------------------------------------
    And certificate "cert" is loaded from the participant material
    And its group and filename prefix are known

  # --- Key strength --------------------------------------------------------
  Rule: RSA and DSA keys are at least 3000 bit; EC keys are P-256

    @enforced
    Scenario: Public key meets the minimum size for its algorithm
      # An algorithm absent from this table FAILS. Unlisted is unreviewed,
      # which is not the same as permitted.
      Then "cert" public key must satisfy the minimum size:
        | algorithm | minBits |
        | RSA       | 3000    |
        | DSA       | 3000    |
        | EC        | 256     |

    @proposed
    Scenario: Public key algorithm is on the allow-list
      # The rule engine accepts RSA, DSA and EC. GDHCN signing is RSA or
      # EC P-256 only, so this is stricter than what /validate enforces.
      Then "cert" public key algorithm must be one of "RSA, EC(P-256)"

  # --- Key usage -----------------------------------------------------------
  Rule: keyUsage flags match the role the folder assigns

    @enforced
    Scenario: The keyUsage extension is present at all
      Then "cert" must contain extension "2.5.29.15"

    @enforced
    Scenario: TLS end-entity keyUsage
      Given "cert" group is "TLS" and filename starts with "TLS"
      Then "cert" keyUsage "digitalSignature" must be true
      And "cert" keyUsage "cRLSign" must be false

    @proposed
    Scenario: TLS CA keyUsage
      # One role per scenario: a combined TLS-CA-and-UPLOAD scenario would be
      # ambiguous about which role broke when it failed.
      Given "cert" group is "TLS" and filename starts with "CA"
      Then "cert" keyUsage "keyCertSign" must be true

    @enforced
    Scenario: UPLOAD keyUsage
      Given "cert" group is "UP"
      Then "cert" keyUsage "digitalSignature" must be true

    @enforced
    Scenario: SCA keyUsage
      Given "cert" group is "SCA"
      Then "cert" keyUsage "keyCertSign" must be true

  # --- Extended key usage --------------------------------------------------
  Rule: TLS client certificates are usable for client authentication

    @enforced
    Scenario: TLS end-entity declares clientAuth
      Given "cert" group is "TLS" and filename starts with "TLS"
      Then "cert" EKU must include "1.3.6.1.5.5.7.3.2"

    @enforced
    Scenario: EKU is not required of the other roles
      # Documentation-only waiver. It PASSES for the waived groups and SKIPS
      # otherwise, so it can never be mistaken for evidence that a TLS leaf's
      # EKU was checked.
      Then "cert" EKU requirement is waived for groups "CA, SCA, UP, DECA"

  # --- Basic constraints ---------------------------------------------------
  Rule: only the certificates that must be CAs are CAs

    @enforced
    Scenario: SCA is a CA with an unconstrained or zero path length
      Given "cert" group is "SCA"
      Then "cert" basicConstraints CA must be true
      And "cert" basicConstraints pathLen must be "0 or absent"

    @proposed
    Scenario: The CA in a TLS group is a CA
      # EXPECTED TO FAIL on the reference material — see the header. This is
      # the scenario that exposes the gap between the spec as revised and the
      # rules as enforced.
      Given "cert" group is "TLS" and filename starts with "CA"
      Then "cert" basicConstraints CA must be true

    @proposed
    Scenario: End-entity certificates are not CAs
      # Within TLS this skips the CA file, which is a CA by definition.
      Then "cert" basicConstraints CA must be false for groups:
        | group |
        | TLS   |
        | UP    |

  # --- Chain ---------------------------------------------------------------
  Rule: a TLS end-entity is issued by a CA in its own group

    @enforced
    Scenario: The TLS end-entity is signed by the CA beside it
      # This compares issuer DN against the CA's subject DN. The cryptographic
      # check is tng.cert.chain in the rule engine; both read the same facts.
      Given "tlsCert" is a TLS end-entity certificate
      And "caCert" is the CA certificate in the same TLS group
      Then "tlsCert" must be signed by "caCert"

    @enforced
    Scenario: A TLS end-entity nothing signs is rejected
      Given "tlsCert" is a TLS end-entity certificate
      And no CA certificate in its TLS group verifies it
      Then "tlsCert" must be rejected

  # --- Subject -------------------------------------------------------------
  Rule: the subject identifies the participant

    @proposed
    Scenario: Subject common name is populated
      # rules.yaml exposes subject.require_common_name; it ships off.
      Then "cert" subject CN must be non-empty

    @enforced
    Scenario: Subject country is the participant's own
      # Skips when the harness was given no participant country, rather than
      # silently passing.
      Then "cert" subject country must equal the participant country

  # --- Validity ------------------------------------------------------------
  Rule: certificates do not outlive the limit for their role

    @enforced
    Scenario: Validity is within the limit for the group
      # A group absent from the table skips rather than failing.
      Then "cert" validity must not exceed the limit for its group:
        | group | maxYears |
        | SCA   | 4        |
        | DECA  | 4        |
        | TLS   | 2        |
        | UP    | 2        |

    @proposed
    Scenario: An SCA does not issue a DSC that outlives it
      # Cross-certificate check. It skips entirely when the material contains
      # no DSC, which is the case for a participant shipping only TLS/UP/SCA.
      Given "dsc" is a DSC issued by "sca"
      Then "dsc" notAfter must not exceed "sca" notAfter
