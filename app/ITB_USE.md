# FHIR Validator HTTP Service - ITB Integration Guide

This guide explains how to use the FHIR Validator as a persistent HTTP service for the Interoperability Test Bed (ITB) and similar testing environments.

## Starting the Service

The validator runs as a long-lived HTTP server that loads FHIR definitions once at startup and then serves requests continuously.

### Basic startup (R4, port 8080)

```bash
java -jar org.hl7.fhir.validation.cli.jar -server 8080
```

### With Implementation Guides pre-loaded

```bash
java -jar org.hl7.fhir.validation.cli.jar -server 8080 -ig hl7.fhir.us.core#5.0.1
```

### With multiple IGs and a specific terminology server

```bash
java -jar org.hl7.fhir.validation.cli.jar -server 8080 \
  -ig hl7.fhir.us.core#5.0.1 \
  -ig hl7.fhir.us.mcode#3.0.0 \
  -tx https://tx.fhir.org/r4
```

### Docker / ITB deployment

```dockerfile
FROM eclipse-temurin:17-jre
COPY org.hl7.fhir.validation.cli.jar /app/validator.jar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf -X POST http://localhost:8080/validateResource \
    -H "Content-Type: application/fhir+json" -d '{"resourceType":"Patient"}' || exit 1
ENTRYPOINT ["java", "-jar", "/app/validator.jar", "-server", "8080"]
```

With IGs pre-loaded:

```dockerfile
FROM eclipse-temurin:17-jre
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY org.hl7.fhir.validation.cli.jar /app/validator.jar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf -X POST http://localhost:8080/validateResource \
    -H "Content-Type: application/fhir+json" -d '{"resourceType":"Patient"}' || exit 1
ENTRYPOINT ["java", "-jar", "/app/validator.jar", "-server", "8080", \
  "-ig", "hl7.fhir.be.core#2.1.2"]
```

With local IG files mounted at runtime:

```bash
docker run -d -p 8080:8080 -v /path/to/igs:/data/igs my-validator
# Then load IGs dynamically:
curl -X POST http://localhost:8080/loadIG -H "Content-Type: application/json" \
  -d '{"ig":"/data/igs/my-custom-ig/"}'
```

Once started, the service logs:
```
FHIR Validator HTTP Service started on port 8080
```

The service stays running until terminated (Ctrl+C or SIGTERM).

---

## Available Endpoints

| Endpoint | Method | Purpose |
|-----------|--------|---------|
| `/validateResource` | POST | Validate a FHIR resource |
| `/fhirpath` | POST | Evaluate a FHIRPath expression |
| `/matchetype` | POST | Compare a resource against a matchetype pattern |
| `/testdata` | POST | Generate test data from a FHIR profile |
| `/loadIG` | POST | Dynamically load an Implementation Guide |
| `/stop` | POST | Gracefully stop the HTTP service |

## Health Check

There is no dedicated health endpoint. Use one of these approaches:

**PowerShell:**
```powershell
# Quick: returns 405 if server is listening (any GET returns Method Not Allowed)
try { Invoke-WebRequest -Uri http://localhost:8080/validateResource -Method GET -ErrorAction Stop } catch { $_.Exception.Response.StatusCode }

# Proper: returns 200 if fully operational
(Invoke-WebRequest -Uri http://localhost:8080/validateResource -Method POST -ContentType "application/fhir+json" -Body '{"resourceType":"Patient"}').StatusCode
```

**curl:**
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/validateResource \
  -H "Content-Type: application/fhir+json" -d '{"resourceType":"Patient"}'
```

**Docker healthcheck:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf -X POST http://localhost:8080/validateResource \
    -H "Content-Type: application/fhir+json" -d '{"resourceType":"Patient"}' || exit 1
```

---

## 1. Validate Resource (`/validateResource`)

Validates a FHIR resource against the base specification and/or specific profiles.

### Request

- **Method:** POST
- **Body:** The FHIR resource (JSON or XML)
- **Content-Type:** `application/fhir+json` or `application/fhir+xml`
- **Accept:** `application/fhir+json` or `application/fhir+xml` (controls response format)

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `profiles` | string (comma-separated) | *(none)* | Profile URLs to validate against |
| `resourceIdRule` | enum | `OPTIONAL` | `OPTIONAL`, `REQUIRED`, or `PROHIBITED` |
| `anyExtensionsAllowed` | boolean | `true` | Allow unrecognized extensions |
| `bpWarnings` | enum | `Ignore` | Best practice warnings: `Ignore`, `Hint`, `Warning`, `Error` |
| `displayOption` | enum | `Ignore` | Display checking: `Ignore`, `Check`, `CheckCaseAndSpace`, `CheckCase`, `CheckSpace` |

### Examples

#### Validate a Patient (JSON)

```http
POST http://localhost:8080/validateResource
Content-Type: application/fhir+json
Accept: application/fhir+json

{
  "resourceType": "Patient",
  "id": "example",
  "name": [{"family": "Doe", "given": ["John"]}],
  "gender": "male",
  "birthDate": "1990-01-01"
}
```

#### Validate against a profile

```http
POST http://localhost:8080/validateResource?profiles=http%3A%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FStructureDefinition%2Fus-core-patient
Content-Type: application/fhir+json
Accept: application/fhir+json

{
  "resourceType": "Patient",
  "id": "example",
  "identifier": [{"system": "http://example.org", "value": "12345"}],
  "name": [{"family": "Doe", "given": ["John"]}],
  "gender": "male"
}
```

#### Validate XML

```http
POST http://localhost:8080/validateResource
Content-Type: application/fhir+xml
Accept: application/fhir+xml

<?xml version="1.0" encoding="UTF-8"?>
<Patient xmlns="http://hl7.org/fhir">
  <id value="example"/>
  <name>
    <family value="Doe"/>
    <given value="John"/>
  </name>
</Patient>
```

### Response

Returns a FHIR `OperationOutcome` resource with validation results:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": { "text": "All OK" }
    }
  ]
}
```

Or with errors:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "structure",
      "details": {
        "text": "Patient.identifier: minimum required = 1, but only found 0"
      },
      "expression": ["Patient"]
    }
  ]
}
```

---

## 2. FHIRPath Evaluation (`/fhirpath`)

Evaluates a FHIRPath expression against a FHIR resource and returns the result.

### Request

- **Method:** POST
- **Body:** The FHIR resource (JSON or XML)
- **Content-Type:** `application/fhir+json` or `application/fhir+xml`
- **Accept:** `application/fhir+json` or `application/fhir+xml`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `expression` | string | **Yes** | The FHIRPath expression to evaluate |

### Examples

#### Extract patient family name

```http
POST http://localhost:8080/fhirpath?expression=Patient.name.family
Content-Type: application/fhir+json
Accept: application/fhir+json

{
  "resourceType": "Patient",
  "name": [{"family": "Doe", "given": ["John"]}]
}
```

**Response:**

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "expression", "valueString": "Patient.name.family" },
    { "name": "result", "valueString": "Doe" }
  ]
}
```

#### Check if a field exists

```http
POST http://localhost:8080/fhirpath?expression=Patient.name.exists()
Content-Type: application/fhir+json
Accept: application/fhir+json

{
  "resourceType": "Patient",
  "name": [{"family": "Doe"}]
}
```

**Response:**

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "expression", "valueString": "Patient.name.exists()" },
    { "name": "result", "valueString": "true" }
  ]
}
```

#### Count elements

```http
POST http://localhost:8080/fhirpath?expression=Patient.name.given.count()
Content-Type: application/fhir+json
Accept: application/fhir+json

{
  "resourceType": "Patient",
  "name": [{"family": "Doe", "given": ["John", "James"]}]
}
```

### Error Responses

| Status | Cause |
|--------|-------|
| 400 | Missing `expression` query parameter |
| 405 | GET method used instead of POST |
| 500 | Invalid FHIRPath expression or parsing error |

---

## 3. Matchetype Comparison (`/matchetype`)

Compares an actual FHIR resource against an expected "matchetype" pattern. Useful for asserting that a resource matches expected values in test scenarios.

### Request

- **Method:** POST
- **Body:** JSON object with two fields:
  - `resource`: The actual FHIR resource to check
  - `matchetype`: The expected pattern to match against
- **Content-Type:** `application/json`
- **Accept:** `application/fhir+json` or `application/fhir+xml`

### Matching Modes

**Complete mode** (default): Every element in the matchetype must match exactly in the resource, and the resource must not have extra elements beyond what the matchetype specifies.

**Partial mode**: The matchetype is treated as a pattern - only the elements present in the matchetype are checked. Extra elements in the resource are allowed. Enable by adding the matchetype extension:

```json
"extension": [{
  "url": "http://hl7.org/fhir/tools/StructureDefinition/matchetype",
  "valueString": "partial"
}]
```

### Wildcards (Partial Mode)

| Wildcard | Matches |
|----------|---------|
| `$string$` | Any non-empty string |
| `$uuid$` | Any UUID |
| `$date$` | Any valid date |
| `$instant$` | Any valid instant |
| `$choice:v1\|v2` | One of the listed values |
| `$fragments:t1\|t2` | String containing all listed fragments |

### Examples

#### Exact match (complete mode)

```http
POST http://localhost:8080/matchetype
Content-Type: application/json
Accept: application/fhir+json

{
  "resource": {
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}]
  },
  "matchetype": {
    "resourceType": "Patient",
    "name": [{"family": "Doe", "given": ["John"]}]
  }
}
```

**Response (success):**

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "information",
    "code": "informational",
    "details": { "text": "Matchetype comparison: All OK" }
  }]
}
```

#### Pattern match with wildcard (partial mode)

```http
POST http://localhost:8080/matchetype
Content-Type: application/json
Accept: application/fhir+json

{
  "resource": {
    "resourceType": "Patient",
    "id": "abc-123",
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male"
  },
  "matchetype": {
    "resourceType": "Patient",
    "extension": [{
      "url": "http://hl7.org/fhir/tools/StructureDefinition/matchetype",
      "valueString": "partial"
    }],
    "name": [{"family": "$string$"}]
  }
}
```

This checks that the resource has a `name` with a non-empty `family` value, ignoring other fields.

#### Mismatch detection

```http
POST http://localhost:8080/matchetype
Content-Type: application/json
Accept: application/fhir+json

{
  "resource": {
    "resourceType": "Patient",
    "name": [{"family": "Doe"}]
  },
  "matchetype": {
    "resourceType": "Patient",
    "name": [{"family": "Smith"}]
  }
}
```

**Response (error):**

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "value",
    "details": { "text": "Values differ: expected 'Smith' but found 'Doe'" }
  }]
}
```

### Error Responses

| Status | Cause |
|--------|-------|
| 400 | Missing `resource` or `matchetype` field |
| 405 | GET method used instead of POST |
| 500 | Parsing error or comparison failure |

---

## 4. Test Data Generation (`/testdata`)

Generates synthetic FHIR resource instances from a StructureDefinition profile. The factory populates fields based on profile constraints, value set bindings, and optional data mappings.

### Request

- **Method:** POST
- **Body:** JSON object with configuration fields
- **Content-Type:** `application/json`

### Body Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `profile` | string | **Yes** | - | URL of the StructureDefinition profile (must be loaded in the engine) |
| `data` | array | No | 1 empty row | Array of row objects with column name/value pairs |
| `mappings` | array | No | *(none)* | Field mapping definitions linking data columns to FHIR element paths (required to use `data`) |
| `format` | string | No | `"json"` | Output format: `"json"` or `"xml"` |
| `bundle` | string | No | `"false"` | Set to `"true"` to wrap all rows in a Bundle |

### Examples

#### Generate a Patient from base profile

```http
POST http://localhost:8080/testdata
Content-Type: application/json
Accept: application/fhir+json

{
  "profile": "http://hl7.org/fhir/StructureDefinition/Patient"
}
```

**Response:** A generated Patient resource with auto-populated fields based on the profile's constraints.

#### Generate with data rows and mappings

The `data` array provides tabular row data (each object = one row), and `mappings` tells the factory which data column maps to which FHIR element path. **Without `mappings`, the `data` columns are ignored** and the factory uses base test data instead.

Each mapping has:
- `path`: The FHIR element path (e.g., `Patient.gender`, `Patient.name`, or the element definition ID)
- `expression`: A FHIRPath expression for **primitive** elements. Use `column('columnName')` to access data columns.
- `parts`: For **complex** types (Identifier, HumanName, Address, etc.), use a `parts` array instead of `expression`. Each part has a `name` (sub-element) and `expression`.

```http
POST http://localhost:8080/testdata
Content-Type: application/json
Accept: application/fhir+json

{
  "profile": "http://hl7.org/fhir/StructureDefinition/Patient",
  "data": [
    {"familyName": "Doe", "givenName": "John", "sex": "male", "ssn": "123-45-6789"}
  ],
  "mappings": [
    {"path": "Patient.name", "parts": [
      {"name": "family", "expression": "column('familyName')"},
      {"name": "given",  "expression": "column('givenName')"}
    ]},
    {"path": "Patient.identifier", "parts": [
      {"name": "system", "expression": "'http://example.org/ssn'"},
      {"name": "value",  "expression": "column('ssn')"}
    ]},
    {"path": "Patient.gender", "expression": "column('sex')"}
  ]
}
```

#### Generate multiple resources as a Bundle

```http
POST http://localhost:8080/testdata
Content-Type: application/json
Accept: application/fhir+json

{
  "profile": "http://hl7.org/fhir/StructureDefinition/Patient",
  "data": [
    {"familyName": "Doe", "givenName": "John"},
    {"familyName": "Smith", "givenName": "Jane"},
    {"familyName": "Wilson", "givenName": "Bob"}
  ],
  "mappings": [
    {"path": "Patient.name", "parts": [
      {"name": "family", "expression": "column('familyName')"},
      {"name": "given",  "expression": "column('givenName')"}
    ]}
  ],
  "bundle": "true"
}
```

**Response:** A FHIR Bundle (type: collection) containing one generated Patient per data row.

#### Generate in XML format

```http
POST http://localhost:8080/testdata
Content-Type: application/json

{
  "profile": "http://hl7.org/fhir/StructureDefinition/Patient",
  "format": "xml"
}
```

#### Generate from a custom profile (must be loaded via -ig)

```bash
# Start server with custom IG
java -jar org.hl7.fhir.validation.cli.jar -server 8080 -ig hl7.fhir.us.core#5.0.1
```

```http
POST http://localhost:8080/testdata
Content-Type: application/json

{
  "profile": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
}
```

### Error Responses

| Status | Cause |
|--------|-------|
| 400 | Missing `profile` field |
| 405 | GET method used instead of POST |
| 500 | Profile not found, base data download failure, or generation error |

### Notes

- The first call may take longer as it downloads base test data (~SQLite database) from fhir.org. This is cached for subsequent calls.
- Generated resources use deterministic values (testing mode) for reproducibility.
- Profiles must be available in the engine context - either built-in (base spec profiles), loaded via `-ig` at startup, or loaded dynamically via `/loadIG`.

---

## 5. Load Implementation Guide (`/loadIG`)

Dynamically loads an Implementation Guide package into the running server. This allows you to add profiles, extensions, and value sets without restarting the server.

### Request

- **Method:** POST
- **Body:** JSON object with an `ig` field
- **Content-Type:** `application/json`

### Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ig` | string | **Yes** | IG package identifier (e.g., `hl7.fhir.us.core#5.0.1`) |

### Examples

#### Load US Core

```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "hl7.fhir.us.core#5.0.1"
}
```

**Response (success):**

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "information",
    "code": "informational",
    "diagnostics": "IG loaded successfully: hl7.fhir.us.core#5.0.1"
  }]
}
```

#### Load from a local file path

```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "/path/to/my-ig-package.tgz"
}
```

#### Load from a URL

```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "https://packages.fhir.org/hl7.fhir.us.core/5.0.1"
}
```

### Supported IG Source Formats

The `ig` field accepts multiple formats beyond simple package IDs:

| Format | Example | Description |
|--------|---------|-------------|
| Published package | `hl7.fhir.us.core#5.0.1` | Downloads from the FHIR package registry |
| Package (latest) | `hl7.fhir.us.core` | Uses the latest published version |
| Version-prefixed | `[R4]hl7.fhir.us.core#5.0.1` | Forces a specific FHIR version context |
| URL to `.tgz` | `https://example.org/my-ig.tgz` | Downloads a package tarball from a URL |
| URL to IG | `https://build.fhir.org/ig/HL7/US-Core/` | Loads from an IG publication URL (fetches `package.tgz` from it) |
| CI build | `https://build.fhir.org/ig/HL7/US-Core/branches/main/` | Loads a specific branch from the FHIR CI build server |
| Local `.tgz` file | `/path/to/my-ig-package.tgz` | Loads a local package tarball |
| Local directory | `/path/to/ig-folder/` | Loads from a local folder (must contain `package.tgz` or `package/package.json`) |
| Local resource file | `/path/to/StructureDefinition-myprofile.json` | Loads a single FHIR resource file |

#### Examples

**Load a CI build (latest on main branch):**
```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "https://build.fhir.org/ig/HL7/US-Core/branches/main/"
}
```

**Load a specific `.tgz` from a URL:**
```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "https://packages.fhir.org/hl7.fhir.us.core/5.0.1"
}
```

**Load from a local directory (Docker volume mount):**
```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "/data/igs/my-custom-ig/"
}
```

**Load a single StructureDefinition file:**
```http
POST http://localhost:8080/loadIG
Content-Type: application/json

{
  "ig": "/data/profiles/StructureDefinition-MyPatient.json"
}
```

### Notes

- Loading an IG downloads and processes the package, which may take 10-30 seconds depending on size.
- Dependencies of the IG are automatically loaded as well.
- Once loaded, the IG's profiles, extensions, and value sets are immediately available for `/validateResource`, `/testdata`, etc.
- Loading the same IG twice is safe - duplicates are skipped.
- This is equivalent to the `-ig` command-line option but can be done at runtime.
- For Docker deployments, you can mount a volume with local IG files and reference them by their container path.

### Error Responses

| Status | Cause |
|--------|-------|
| 400 | Missing `ig` field |
| 405 | GET method used instead of POST |
| 500 | Package not found, download failure, or processing error |

---

## 6. Stop Service (`/stop`)

Gracefully shuts down the HTTP service.

### Request

- **Method:** POST
- **Body:** *(empty)*

### Example

```http
POST http://localhost:8080/stop
```

The server will shut down after responding. Use this for clean Docker container shutdown or automated test teardown.

---

## ITB Integration Patterns

### Typical ITB Workflow

1. **Start the validator service** with required IGs pre-loaded
2. **Generate test data** using `/testdata` with a profile
3. **Validate the generated resource** using `/validateResource` against the same profile
4. **Evaluate specific fields** using `/fhirpath` to extract values for assertions
5. **Compare against expected output** using `/matchetype` for structural matching

### Example: Complete Test Cycle (PowerShell)

```powershell
# 1. Generate a test Patient
$patient = Invoke-RestMethod -Uri http://localhost:8080/testdata -Method POST `
  -ContentType "application/json" `
  -Body '{"profile":"http://hl7.org/fhir/StructureDefinition/Patient"}'
$patientJson = $patient | ConvertTo-Json -Depth 20

# 2. Validate it
Invoke-RestMethod -Uri http://localhost:8080/validateResource -Method POST `
  -ContentType "application/fhir+json" -Body $patientJson

# 3. Extract the family name
Invoke-RestMethod -Uri "http://localhost:8080/fhirpath?expression=Patient.name.family" `
  -Method POST -ContentType "application/fhir+json" -Body $patientJson

# 4. Check structure matches expected pattern
$matchBody = @{
  resource = $patient
  matchetype = @{
    resourceType = "Patient"
    extension = @(@{url="http://hl7.org/fhir/tools/StructureDefinition/matchetype"; valueString="partial"})
    name = @(@{family='$string$'})
  }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri http://localhost:8080/matchetype -Method POST `
  -ContentType "application/json" -Body $matchBody
```

### Example: Complete Test Cycle (curl / bash)

```bash
# 1. Generate a test Patient
PATIENT=$(curl -s -X POST http://localhost:8080/testdata \
  -H "Content-Type: application/json" \
  -d '{"profile":"http://hl7.org/fhir/StructureDefinition/Patient"}')

# 2. Validate it
echo "$PATIENT" | curl -s -X POST http://localhost:8080/validateResource \
  -H "Content-Type: application/fhir+json" \
  -d @-

# 3. Extract the family name
echo "$PATIENT" | curl -s -X POST \
  "http://localhost:8080/fhirpath?expression=Patient.name.family" \
  -H "Content-Type: application/fhir+json" \
  -d @-

# 4. Check structure matches expected pattern
curl -s -X POST http://localhost:8080/matchetype \
  -H "Content-Type: application/json" \
  -d "{
    \"resource\": $PATIENT,
    \"matchetype\": {
      \"resourceType\": \"Patient\",
      \"extension\": [{\"url\":\"http://hl7.org/fhir/tools/StructureDefinition/matchetype\",\"valueString\":\"partial\"}],
      \"name\": [{\"family\": \"\$string\$\"}]
    }
  }"
```

### Startup Options Reference

| Option | Description |
|--------|-------------|
| `-server <port>` | Start HTTP server on the specified port |
| `-ig <package#version>` | Load an Implementation Guide package |
| `-tx <url>` | Terminology server URL (default: `https://tx.fhir.org`) |
| `-version <ver>` | FHIR version: `1.0`, `3.0`, `4.0`, `5.0` |
| `-sct <edition>` | SNOMED CT edition (e.g., `900000000000207008`) |

### Building from Source

#### Linux / macOS

```bash
# Clean and build
rm -rf org.hl7.fhir.validation.cli/target
mvn install -pl org.hl7.fhir.validation -am -DskipTests "-Danimal.sniffer.skip=true"
mvn package -pl org.hl7.fhir.validation.cli -DskipTests

# Run
java -jar org.hl7.fhir.validation.cli/target/org.hl7.fhir.validation.cli-*.jar -server 8080
```

#### Windows (PowerShell)

```powershell
# Clean and build
rm -r -Force org.hl7.fhir.validation.cli\target
mvn install -pl org.hl7.fhir.validation -am -DskipTests "-Danimal.sniffer.skip=true"
mvn package -pl org.hl7.fhir.validation.cli -DskipTests

# Run
java -jar org.hl7.fhir.validation.cli\target\org.hl7.fhir.validation.cli-6.7.11-SNAPSHOT.jar -server 8080
```
