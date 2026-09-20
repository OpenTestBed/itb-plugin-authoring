#!/usr/bin/env python3
"""Build a FHIR package from SUSHI output, without the IG Publisher.

Local workaround. The publisher requires every "additional resource" instance to
carry a root-level `resourceDefinition`; that element is not part of the
StructureDefinition, so SUSHI rejects it and FSH cannot emit it. Without it the
publisher parses TestPlan against the wrong model and silently drops
runner / mode / suite - taking suite.input.file, the pointer to the Gherkin,
with it.

So: author in FSH, run SUSHI, then inject resourceDefinition here and assemble
the package ourselves.

    python _package.py            # sushi + fix + package
    python _package.py --no-sushi # skip sushi, use existing fsh-generated/

Output: dist/package.tgz, laid out the way the publisher would. It deliberately
does NOT write into output/ - the IG Publisher owns that directory and would
overwrite the tarball with its own build.

If you do run the publisher afterwards, use -no-sushi: this script patches
fsh-generated in place, and the publisher's own SUSHI pass would undo that.

    package/package.json
    package/.index.json
    package/<Resource>-<id>.json
    package/tests/gherkin/*.feature      <- raw Gherkin, what a runner consumes
"""
import io, json, os, shutil, subprocess, sys, tarfile, collections

ROOT      = os.path.dirname(os.path.abspath(__file__))
GENERATED = os.path.join(ROOT, 'fsh-generated', 'resources')
DIST      = os.path.join(ROOT, 'dist')
STAGING   = os.path.join(DIST, '_staging')
TARBALL   = os.path.join(DIST, 'package.tgz')
TESTS_SRC = os.path.join(ROOT, 'input', 'testing', 'gherkin')
TESTS_DST = 'tests/gherkin'
FHIR_CACHE = os.path.join(os.path.expanduser('~'), '.fhir', 'packages')

# Resource types that are "additional resources" - not in core, so their
# instances need a resourceDefinition naming the definition they conform to.
ADDITIONAL_FROM = 'hl7.fhir.uv.testing#current'
ADDITIONAL_TYPES = ('TestPlan', 'TestScript', 'TestReport')


def run_sushi():
    print('== sushi ==')
    cmd = ['npx', '--yes', 'fsh-sushi@latest', ROOT]
    r = subprocess.run(cmd, cwd=ROOT, shell=(os.name == 'nt'))
    if r.returncode != 0:
        sys.exit('sushi failed (exit %d)' % r.returncode)


def core_package(fhir_version):
    """Directory of the core package for this IG's FHIR version, if cached."""
    for name in ('hl7.fhir.r6.core', 'hl7.fhir.r5.core', 'hl7.fhir.r4.core'):
        d = os.path.join(FHIR_CACHE, '%s#%s' % (name, fhir_version), 'package')
        if os.path.isdir(d):
            return d
    return None


def additional_resource_definitions(fhir_version):
    """canonical|version for each type that is genuinely an *additional*
    resource for this FHIR version - i.e. defined by the dependency package and
    NOT by core. A type that core already defines needs no resourceDefinition,
    and stamping one on it would be wrong.

    This matters because it flips between FHIR versions: R6 6.0.0-ballot3 ships
    TestPlan in core, 6.0.0-ballot5 does not.
    """
    pkg = os.path.join(FHIR_CACHE, ADDITIONAL_FROM, 'package')
    core = core_package(fhir_version)
    defs = {}
    if not os.path.isdir(pkg):
        print('!! %s not in the FHIR cache - run sushi first' % ADDITIONAL_FROM)
        return defs
    for t in ADDITIONAL_TYPES:
        if core and os.path.isfile(os.path.join(core, 'StructureDefinition-%s.json' % t)):
            print('   %-11s in core %s - not an additional resource, skipping'
                  % (t, os.path.basename(os.path.dirname(core))))
            continue
        f = os.path.join(pkg, 'StructureDefinition-%s.json' % t)
        if os.path.isfile(f):
            sd = json.load(open(f, encoding='utf-8'))
            defs[t] = '%s|%s' % (sd['url'], sd['version'])
    return defs


def manifest(ig):
    """package.json, from the ImplementationGuide SUSHI generated."""
    m = collections.OrderedDict()
    m['name']         = ig.get('packageId') or ig['id']
    m['version']      = ig['version']
    m['tools-version'] = 3
    m['type']         = 'IG'
    m['date']         = (ig.get('date') or '').replace('-', '')
    m['license']      = ig.get('license')
    m['canonical']    = ig['url'].split('/ImplementationGuide/')[0]
    m['url']          = m['canonical']
    m['title']        = ig.get('title')
    m['description']  = ig.get('description')
    m['fhirVersions'] = ig.get('fhirVersion', [])
    m['dependencies'] = collections.OrderedDict(
        (d['packageId'], d['version']) for d in ig.get('dependsOn', []))
    return collections.OrderedDict((k, v) for k, v in m.items() if v not in (None, '', [], {}))


def ig_id():
    """The IG's id, from the single ImplementationGuide SUSHI generated."""
    for n in os.listdir(GENERATED):
        if n.startswith('ImplementationGuide-') and n.endswith('.json'):
            return n[len('ImplementationGuide-'):-len('.json')]
    sys.exit('no ImplementationGuide in fsh-generated - run sushi first')


def main():
    if '--no-sushi' not in sys.argv:
        run_sushi()
    if not os.path.isdir(GENERATED):
        sys.exit('no fsh-generated/resources - run sushi first')

    ig_preview = json.load(open(os.path.join(GENERATED, 'ImplementationGuide-%s.json' % ig_id()),
                                encoding='utf-8'))
    fhir_version = (ig_preview.get('fhirVersion') or [''])[0]
    print('== additional resources (FHIR %s) ==' % fhir_version)
    defs = additional_resource_definitions(fhir_version)
    for t, v in defs.items():
        print('   %-11s %s' % (t, v))
    if not defs:
        print('   (none - every test resource type is in core)')

    if os.path.isdir(STAGING):
        shutil.rmtree(STAGING)
    pkgdir = os.path.join(STAGING, 'package')
    os.makedirs(os.path.join(pkgdir, *TESTS_DST.split('/')))

    ig, index, fixed, repaired = None, [], [], []
    for name in sorted(os.listdir(GENERATED)):
        if not name.endswith('.json'):
            continue
        d = json.load(open(os.path.join(GENERATED, name), encoding='utf-8'),
                      object_pairs_hook=collections.OrderedDict)
        rt = d.get('resourceType')

        if rt in defs and 'resourceDefinition' not in d:
            # Re-key so resourceDefinition sits right after resourceType.
            out = collections.OrderedDict(resourceType=rt)
            out['resourceDefinition'] = defs[rt]
            out.update((k, v) for k, v in d.items() if k != 'resourceType')
            d = out
            fixed.append('%s/%s' % (rt, d.get('id')))
            repaired.append(('%s/%s' % (rt, d.get('id')), name, d))

        if rt == 'ImplementationGuide':
            ig = d

        io.open(os.path.join(pkgdir, name), 'w', encoding='utf-8', newline='\n').write(
            json.dumps(d, indent=2, ensure_ascii=False) + '\n')

        entry = collections.OrderedDict(filename=name, resourceType=rt)
        for k in ('id', 'url', 'version'):
            if k in d:
                entry[k] = d[k]
        index.append(entry)

    if ig is None:
        sys.exit('no ImplementationGuide in fsh-generated - cannot build a manifest')

    print('== resourceDefinition injected ==')
    for f in fixed:
        print('   %s' % f)
    if not fixed:
        print('   (none)')

    features = []
    if os.path.isdir(TESTS_SRC):
        for f in sorted(os.listdir(TESTS_SRC)):
            shutil.copy2(os.path.join(TESTS_SRC, f),
                         os.path.join(pkgdir, *(TESTS_DST.split('/') + [f])))
            features.append('%s/%s' % (TESTS_DST, f))

    io.open(os.path.join(pkgdir, '.index.json'), 'w', encoding='utf-8', newline='\n').write(
        json.dumps(collections.OrderedDict([('index-version', 2), ('files', index)]),
                   indent=2, ensure_ascii=False) + '\n')
    io.open(os.path.join(pkgdir, 'package.json'), 'w', encoding='utf-8', newline='\n').write(
        json.dumps(manifest(ig), indent=2, ensure_ascii=False) + '\n')

    # Write the repaired resources back over fsh-generated as well. The IG
    # Publisher reads that directory directly, so without this it parses the
    # un-repaired files and silently drops runner / mode / suite - taking
    # suite.input.file with them. Run the publisher with -no-sushi afterwards,
    # or its own SUSHI pass regenerates these and undoes the repair.
    for rt_id, name, doc in repaired:
        io.open(os.path.join(GENERATED, name), 'w', encoding='utf-8', newline='\n').write(
            json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
    if repaired:
        print('== fsh-generated patched in place ==')
        print('   %d resource(s) - run the publisher with -no-sushi to keep this'
              % len(repaired))

    os.makedirs(os.path.dirname(TARBALL), exist_ok=True)
    with tarfile.open(TARBALL, 'w:gz') as tar:
        tar.add(pkgdir, arcname='package')

    print('== package ==')
    print('   %s (%.1f KB)' % (os.path.relpath(TARBALL, ROOT), os.path.getsize(TARBALL) / 1024.0))
    print('   %d resources, %d feature file(s)' % (len(index), len(features)))


if __name__ == '__main__':
    main()
