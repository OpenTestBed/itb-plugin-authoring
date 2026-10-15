#!/bin/bash
# Optional. Download a SPECIFIC IG Publisher version instead of the latest.
#
#   ./_pinPublisher.sh 2.3.4
#
# WHY THIS EXISTS. `_updatePublisher.sh` always fetches `latest`, which is
# normally what you want and is left exactly as HL7 ships it. But the publisher
# drops FHIR versions as they are superseded, and an IG targeting one of those
# stops building when `latest` moves on. Observed range, for scale:
#
#   publisher 2.2.10  knows 6.0.0 up to ballot4
#   publisher 2.3.4   adds ballot5
#   publisher 3.0.0+  drops ballot5, requires snapshot1
#
# For a TestPlan IG this bites twice over, because TestPlan is not in FHIR core:
# the version has to be one the publisher supports AND one that
# hl7.fhir.uv.testing is built against. Those drifted apart for five days in
# October 2026 and no version satisfied both.
#
# NOT NEEDED TODAY: fhirVersion 6.0.0-snapshot1 builds with publisher 3.0.1.
# Run _updatePublisher.sh as usual; reach for this only if `latest` refuses the
# IG's fhirVersion, and then go back to `latest` once it moves on.
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "usage: ./_pinPublisher.sh <version>      e.g. ./_pinPublisher.sh 2.3.4"
  echo
  echo "Current jar:"
  if [ -f input-cache/publisher.jar ]; then
    java -jar input-cache/publisher.jar -v 2>/dev/null | head -1 || echo "  (could not read version)"
    ls -la input-cache/publisher.jar | awk '{print "  "$5" bytes, "$6" "$7" "$8}'
  else
    echo "  none in input-cache/"
  fi
  exit 1
fi

if ! type curl > /dev/null 2>&1; then
  echo "ERROR: needs curl."
  exit 1
fi

URL="https://github.com/HL7/fhir-ig-publisher/releases/download/${VERSION}/publisher.jar"
mkdir -p input-cache

echo "fetching publisher ${VERSION}"
echo "  ${URL}"
# -f so a nonexistent tag fails instead of writing a 404 page over the jar.
if ! curl -fsSL --max-time 600 -o input-cache/publisher.jar.part "$URL"; then
  echo "ERROR: could not download ${VERSION}. Check the tag at"
  echo "  https://github.com/HL7/fhir-ig-publisher/releases"
  rm -f input-cache/publisher.jar.part
  exit 1
fi
mv input-cache/publisher.jar.part input-cache/publisher.jar

echo "pinned:"
ls -la input-cache/publisher.jar | awk '{print "  "$5" bytes"}'
echo
echo "Now run ./_genonce.sh . To go back to tracking the latest release,"
echo "run ./_updatePublisher.sh as usual."
