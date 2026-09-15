// Re-export shim. The compiler now lives in @opentestbed/otb-gherkin; this
// file exists so the app's imports keep resolving through one release, and
// will be deleted once they point at the package directly.
//
// Nothing is implemented here. If you are looking for the parser, it is at
// packages/gherkin/src/ in the otb repo.
export * from '@opentestbed/otb-gherkin';
