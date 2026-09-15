// Categorized step templates for the snippet palette — generation-2 syntax.
// Each snippet maps to a step in the core language or a dialect.
// {{placeholders}} indicate values the user needs to fill in.

export interface Snippet {
  id: string;
  label: string;
  description: string;
  template: string;
  keyword: 'Given' | 'When' | 'Then' | 'And';
}

export interface SnippetCategory {
  id: string;
  label: string;
  icon: string;
  snippets: Snippet[];
}

export const snippetCategories: SnippetCategory[] = [
  // ── Structure ──────────────────────────────────────────────────────
  {
    id: 'structure',
    label: 'Structure',
    icon: 'S',
    snippets: [
      {
        id: 'feature',
        label: 'Feature block',
        description: 'Feature header with language and dialect requirements',
        template: '@lang:itb-core-en@^2 @dialect:{{fhir-validator}}@^2\nFeature: {{Feature name}}\n  {{Description of the feature}}\n',
        keyword: 'Given',
      },
      {
        id: 'background',
        label: 'Background',
        description: 'Shared setup: the system under test and a FHIR validator',
        template: '  Background:\n    Given {{Client}} is the system under test\n    And {{FHIRValidator}} is a fhir-validator at "{{http://fhir-validator:8081}}"\n',
        keyword: 'Given',
      },
      {
        id: 'scenario',
        label: 'Scenario',
        description: 'New test case scenario',
        template: '  Scenario: {{tc-001 Scenario name}}\n',
        keyword: 'Given',
      },
      {
        id: 'rule',
        label: 'Rule',
        description: 'Group scenarios under a business rule',
        template: '  Rule: {{the rule these scenarios check}}\n',
        keyword: 'Given',
      },
    ],
  },

  // ── Actors ─────────────────────────────────────────────────────────
  {
    id: 'actors',
    label: 'Actors',
    icon: 'A',
    snippets: [
      {
        id: 'actor-sut',
        label: 'System under test',
        description: 'The actor whose conformance is measured',
        template: '    Given {{Client}} is the system under test at "{{http://sut:8080/fhir}}"',
        keyword: 'Given',
      },
      {
        id: 'actor-sut-defined',
        label: 'System under test, with definition',
        description: 'SUT with its ActorDefinition / CapabilityStatement canonical',
        template: '    Given {{Client}} is the system under test at "{{http://sut:8080/fhir}}" as defined by "{{http://hl7.org/fhir/ActorDefinition/client}}"',
        keyword: 'Given',
      },
      {
        id: 'actor-infra',
        label: 'Infrastructure actor',
        description: 'A supporting actor (peer, mock, server) that is not measured',
        template: '    And {{FHIRServer}} is infrastructure at "{{http://fhir-server:8080/fhir}}"',
        keyword: 'And',
      },
      {
        id: 'actor-kind',
        label: 'Dialect actor (validator, decoder…)',
        description: 'An actor of a dialect kind: fhir-validator, hcert-decoder, smart-helper, tng-validator, archimate-repository, eira-validator',
        template: '    And {{FHIRValidator}} is a {{fhir-validator}} at "{{http://fhir-validator:8081}}"',
        keyword: 'And',
      },
      {
        id: 'load-ig',
        label: 'Load IG package',
        description: 'Load an Implementation Guide on the FHIR validator',
        template: '    And {{FHIRValidator}} is loaded with package "{{hl7.fhir.be.core#2.1.2}}"',
        keyword: 'And',
      },
    ],
  },

  // ── Variables & data ───────────────────────────────────────────────
  {
    id: 'data',
    label: 'Variables & Data',
    icon: 'V',
    snippets: [
      {
        id: 'set-value',
        label: 'Set a variable',
        description: 'Assign a literal, a number, or another variable',
        template: '    Given set ${{name}} to "{{value}}"',
        keyword: 'Given',
      },
      {
        id: 'set-docstring',
        label: 'Set from a doc string',
        description: 'Assign a JSON/XML body',
        template: '    Given set ${{resource}} to:\n      """\n      {"resourceType":"{{Patient}}","name":[{"family":"{{Smith}}"}]}\n      """',
        keyword: 'Given',
      },
      {
        id: 'set-now',
        label: 'Set to the current time',
        description: 'FHIR instant of now',
        template: '    And set ${{nowTs}} to now',
        keyword: 'And',
      },
      {
        id: 'extract-pointer',
        label: 'Extract with a JSON pointer',
        description: 'Read "/path" from a value into a variable',
        template: '    And extract "{{/id}}" from ${{response}} as ${{id}}',
        keyword: 'And',
      },
      {
        id: 'extract-fhirpath',
        label: 'Extract with FHIRPath',
        description: 'Read a FHIRPath expression from a FHIR resource into a variable',
        template: '    And extract "{{Patient.name.family}}" from ${{patient}} as ${{family}}',
        keyword: 'And',
      },
      {
        id: 'declare-type',
        label: 'Declare a value type',
        description: 'Give an untyped value (e.g. a raw response body) a type so paths and conformance know the dialect',
        template: '    And ${{body}} is a {{FHIR resource}}',
        keyword: 'And',
      },
    ],
  },

  // ── HTTP ───────────────────────────────────────────────────────────
  {
    id: 'http',
    label: 'HTTP',
    icon: 'H',
    snippets: [
      {
        id: 'post-body',
        label: 'POST with a doc string',
        description: 'Send a body to an actor-relative path',
        template: '    When {{Client}} posts to {{FHIRServer}} at "{{/Patient}}" with:\n      """\n      {"resourceType":"{{Patient}}"}\n      """\n    Then $response.status should be {{201}}',
        keyword: 'When',
      },
      {
        id: 'post-var',
        label: 'POST a variable',
        description: 'Send a body held in a variable',
        template: '    When {{Client}} posts to {{FHIRServer}} at "{{/Patient}}" with body ${{payload}}',
        keyword: 'When',
      },
      {
        id: 'put-id',
        label: 'PUT with a run-time id',
        description: 'Append an id from an earlier step to the path',
        template: '    When {{Client}} puts to {{FHIRServer}} at "{{/Patient/}}" with id ${{id}} with body ${{payload}}',
        keyword: 'When',
      },
      {
        id: 'get-relative',
        label: 'GET from an actor',
        description: 'GET relative to the actor endpoint and keep the body',
        template: '    When {{Client}} gets from {{FHIRServer}} at "{{/Patient/123}}" as ${{fetched}}',
        keyword: 'When',
      },
      {
        id: 'get-absolute',
        label: 'GET an absolute URL',
        description: 'Fetch a fixture or upstream file',
        template: '    When {{Client}} gets "{{https://example.org/fixture.json}}" as ${{payload}}',
        keyword: 'When',
      },
      {
        id: 'header',
        label: 'Set a header',
        description: 'Header for every following request',
        template: '    And set header "{{Accept}}" to "{{application/fhir+json}}"',
        keyword: 'And',
      },
      {
        id: 'bearer',
        label: 'Bearer token',
        description: 'Authorization header from a variable',
        template: '    And set bearer token from ${{token}}',
        keyword: 'And',
      },
    ],
  },

  // ── Assertions ─────────────────────────────────────────────────────
  {
    id: 'assertions',
    label: 'Assertions',
    icon: '=',
    snippets: [
      {
        id: 'status',
        label: 'Response status',
        description: 'Assert the last HTTP status',
        template: '    Then $response.status should be {{200}}',
        keyword: 'Then',
      },
      {
        id: 'equals',
        label: 'Equals',
        description: 'A value equals a literal or another variable',
        template: '    Then ${{value}} should be "{{expected}}"',
        keyword: 'Then',
      },
      {
        id: 'contains',
        label: 'Contains',
        description: 'Substring check',
        template: '    Then ${{value}} should contain "{{text}}"',
        keyword: 'Then',
      },
      {
        id: 'not-empty',
        label: 'Not empty',
        description: 'The value has content',
        template: '    Then ${{value}} should not be empty',
        keyword: 'Then',
      },
      {
        id: 'at-path',
        label: 'Assert at a path',
        description: 'JSON pointer ("/…") on any value, FHIRPath on a FHIR resource',
        template: '    Then ${{patient}} at "{{Patient.name.family}}" should be "{{Dupont}}"',
        keyword: 'Then',
      },
      {
        id: 'one-of',
        label: 'One of',
        description: 'Membership in a list',
        template: '    Then ${{value}} should be one of "{{a, b, c}}"',
        keyword: 'Then',
      },
      {
        id: 'numeric',
        label: 'Numeric comparison',
        description: 'at least / at most / greater than / less than',
        template: '    Then ${{count}} should be at least {{1}}',
        keyword: 'Then',
      },
    ],
  },

  // ── Conformance & validation ───────────────────────────────────────
  {
    id: 'conformance',
    label: 'Conformance',
    icon: '✓',
    snippets: [
      {
        id: 'conform',
        label: 'Conforms to a profile',
        description: 'Validate against a canonical; dispatched to the declared validator',
        template: '    Then ${{resource}} should conform to "{{http://hl7.org/fhir/StructureDefinition/Patient}}"',
        keyword: 'Then',
      },
      {
        id: 'conform-ignore-slicing',
        label: 'Conforms, ignoring slicing errors',
        description: 'Do not count slice-matching errors (profile-level false positives)',
        template: '    Then ${{bundle}} should conform to "{{profile canonical}}" ignoring slicing errors',
        keyword: 'Then',
      },
      {
        id: 'conform-ignore-matching',
        label: 'Conforms, ignoring errors matching',
        description: 'Do not count errors whose text contains a phrase',
        template: '    Then ${{bundle}} should conform to "{{profile canonical}}" ignoring errors matching "{{phrase}}"',
        keyword: 'Then',
      },
      {
        id: 'not-conform',
        label: 'Does not conform',
        description: 'Expect at least one validation error',
        template: '    Then ${{resource}} should not conform to "{{profile canonical}}"',
        keyword: 'Then',
      },
      {
        id: 'valid-base',
        label: 'Valid base resource',
        description: 'Validate against the base FHIR profile for a type',
        template: '    Then ${{resource}} should be a valid {{Patient}} resource',
        keyword: 'Then',
      },
      {
        id: 'validate-bind',
        label: 'Validate and inspect the outcome',
        description: 'Non-asserting validation; then check $validation.errors',
        template: '    When {{Client}} validates ${{resource}} against "{{profile canonical}}" as ${{outcome}}\n    Then $validation.errors should be {{0}}',
        keyword: 'When',
      },
      {
        id: 'satisfy',
        label: 'FHIRPath assertion',
        description: 'A boolean FHIRPath expression must hold',
        template: '    Then ${{resource}} should satisfy "{{Patient.id.exists()}}"',
        keyword: 'Then',
      },
      {
        id: 'match-pattern',
        label: 'Matches a pattern',
        description: 'Matchetype structural comparison',
        template: '    Then ${{resource}} should match pattern:\n      """\n      {"resourceType":"{{Patient}}","name":[{"family":"{{$string$}}"}]}\n      """',
        keyword: 'Then',
      },
    ],
  },

  // ── Transform & test data ──────────────────────────────────────────
  {
    id: 'fhir-tools',
    label: 'Transform & Test Data',
    icon: 'T',
    snippets: [
      {
        id: 'loads-ig',
        label: 'Load IG',
        description: 'Load an IG (id, tarball URL or path) on the validator',
        template: '    When {{Client}} loads IG "{{https://…/package.tgz}}" on {{FHIRValidator}}',
        keyword: 'When',
      },
      {
        id: 'transform',
        label: 'Transform with a StructureMap',
        description: 'Run a map by canonical on a resource',
        template: '    When {{Client}} transforms ${{input}} with map "{{http://…/StructureMap/Name}}" on {{FHIRValidator}} as ${{output}}',
        keyword: 'When',
      },
      {
        id: 'generate',
        label: 'Generate test data',
        description: 'Populate every element of a profile',
        template: '    Given {{Client}} generates test data from "{{http://hl7.org/fhir/StructureDefinition/Patient}}" as ${{patient}}',
        keyword: 'Given',
      },
      {
        id: 'generate-required-values',
        label: 'Generate required test data with values',
        description: 'Required elements only, then set listed paths',
        template: '    Given {{Client}} generates required test data from "{{http://hl7.org/fhir/StructureDefinition/Patient}}" as ${{patient}} with values:\n      | path            | value        | system | code |\n      | {{Patient.id}}  | {{pat-001}}  |        |      |',
        keyword: 'Given',
      },
      {
        id: 'modify',
        label: 'Modify a resource',
        description: 'set / add / remove operations, optionally enforcing a profile',
        template: '    When {{Client}} modifies ${{resource}} with operations:\n      | op  | path                  | value      | system | code |\n      | set | {{Patient.birthDate}} | {{1990-01-01}} |    |      |',
        keyword: 'When',
      },
    ],
  },

  // ── HCERT ──────────────────────────────────────────────────────────
  {
    id: 'hcert',
    label: 'Health certificates',
    icon: 'Q',
    snippets: [
      {
        id: 'hcert-pipeline',
        label: 'QR → certificate → FHIR',
        description: 'Upload, scan, decode, verify, follow the SHL and fetch the FHIR content',
        template: '    When {{User}} uploads a file as $qrImage\n    And {{User}} scans $qrImage on {{HCertDecoder}} as $qrData\n    And {{User}} decodes $qrData on {{HCertDecoder}} as $hcert\n    And {{User}} verifies the signature of $hcert on {{HCertDecoder}} with:\n      | parameter | value |\n      | gdhcn_env | {{dev}} |\n    And {{User}} extracts the SHL link from $hcert on {{HCertDecoder}} as $shlLink\n    And {{User}} is asked for $pin with "Enter the PIN"\n    And {{User}} authorizes $shlLink on {{HCertDecoder}} with pin $pin as $manifest\n    And {{User}} fetches the FHIR content of $manifest on {{HCertDecoder}} as $bundle',
        keyword: 'When',
      },
    ],
  },

  // ── Interaction ────────────────────────────────────────────────────
  {
    id: 'interaction',
    label: 'Interaction',
    icon: 'I',
    snippets: [
      {
        id: 'inform',
        label: 'Inform the tester',
        description: 'Show a message',
        template: '    And {{Client}} is informed "{{Please review the submission}}"',
        keyword: 'And',
      },
      {
        id: 'ask',
        label: 'Ask for input',
        description: 'Prompt for a value',
        template: '    And {{Client}} is asked for ${{value}} with "{{Enter the value}}"',
        keyword: 'And',
      },
      {
        id: 'upload',
        label: 'Upload a file',
        description: 'Prompt for a file; the bytes are bound to the variable',
        template: '    And {{User}} uploads a file as ${{file}}',
        keyword: 'And',
      },
      {
        id: 'wait-for',
        label: 'Wait for a request',
        description: 'ITB as the peer: catch a request from the SUT',
        template: '    When {{Responder}} waits for {{Client}} within {{300}} seconds\n    Then $received.method should be "{{POST}}"',
        keyword: 'When',
      },
      {
        id: 'exchange',
        label: 'Answer a request',
        description: 'Open an exchange, receive, reply, close',
        template: '    Given {{Responder}} is listening for {{Client}}\n    When {{Responder}} receives a request from {{Client}} within {{300}} seconds\n    And {{Responder}} replies to {{Client}} with status {{200}} and:\n      """\n      {"resourceType":"OperationOutcome"}\n      """\n    And {{Responder}} stops listening for {{Client}}',
        keyword: 'Given',
      },
    ],
  },

  // ── Escape hatch ───────────────────────────────────────────────────
  {
    id: 'escape',
    label: 'Raw ITB',
    icon: '<',
    snippets: [
      {
        id: 'scriptlet',
        label: 'Call a scriptlet',
        description: 'Raw TDL with inputs and an inline body',
        template: '    And call scriptlet "{{checkOutcome}}" with:\n      | name     | value     |\n      | resource | $response |\n      """\n      <verify handler="StringValidator">\n        <input name="actualstring">$resource{severity}</input>\n        <input name="expectedstring">"error"</input>\n      </verify>\n      """',
        keyword: 'And',
      },
      {
        id: 'log',
        label: 'Log',
        description: 'Write to the session log',
        template: '    And log "{{message}}"',
        keyword: 'And',
      },
    ],
  },
];
