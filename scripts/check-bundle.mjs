import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

/** Follow static edges only; dynamic imports are features, not startup dependencies. */
export function staticClosure(manifest, entries) {
  const seen = new Set();
  const visit = key => {
    if (seen.has(key)) return;
    if (!manifest[key]) throw new Error(`Missing manifest dependency: ${key}`);
    seen.add(key);
    for (const dependency of manifest[key].imports || []) visit(dependency);
  };
  entries.forEach(visit);
  return [...seen];
}

export function checkBundle(directory = 'dist') {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
  const size = entries => {
    const chunks = staticClosure(manifest, entries).filter(key => manifest[key].file.endsWith('.js'));
    let raw = 0, gzip = 0;
    for (const key of chunks) {
      const bytes = fs.readFileSync(path.join(directory, manifest[key].file));
      raw += bytes.length;
      gzip += gzipSync(bytes).length;
    }
    return { raw, gzip, chunks: chunks.length };
  };
  const publicTabs = ['FeaturesTab', 'HowItWorksTab', 'WhyAynTab', 'GetDiscoveredTab', 'ProofTab', 'FaqTab', 'PricingTab', 'ContactTab', 'AboutTab', 'HelpTab'].map(name => `src/components/landing/tabs/${name}.tsx`);
  const deferred = [
    ...publicTabs, 'src/components/auth/AuthModal.tsx', 'src/components/auth/LegalConsentGate.tsx',
    'src/components/landing/EmployerLandingSections.tsx', 'src/components/landing/AccountTabs.tsx',
    'src/pages/EmployerHub.tsx', 'src/admin-app/AdminApp.tsx',
    'src/components/resume-hub/GuidedIntake.tsx', 'src/components/resume-hub/ResumeDiffViewer.tsx',
    'src/components/employer/CompanyProfile.tsx', 'src/components/employer/AssessmentsPanel.tsx',
    'src/lib/resumeDocs.ts',
  ];
  const startupKeys = staticClosure(manifest, ['index.html']);
  const startupFiles = new Set(startupKeys.map(key => manifest[key].file));
  for (const key of deferred) {
    // Rollup may give a dynamic facade a shared-chunk key instead of its
    // source path (AdminApp also supplies shared admin hooks).
    const resolved = manifest[key] ? key : Object.keys(manifest).find(candidate => manifest[candidate].name === path.basename(key, path.extname(key)));
    if (!resolved || !manifest[resolved].isDynamicEntry || startupFiles.has(manifest[resolved].file)) throw new Error(`Feature is no longer independently deferred: ${key}`);
  }
  for (const tab of publicTabs) {
    const dependencies = staticClosure(manifest, [tab]);
    for (const other of publicTabs) if (other !== tab && dependencies.includes(other)) throw new Error(`${tab} eagerly loads ${other}`);
  }
  const startup = size(['index.html']);
  const homepage = size(['index.html', 'src/components/landing/JobsBrowser.tsx']);
  const pricing = size(['index.html', 'src/components/landing/tabs/PricingTab.tsx']);
  // Current measured baseline was 1,081,009 raw / 329,538 gzip bytes.
  // Leave small headroom, not the previous 1.5 MB warning exemption.
  if (startup.raw > 750_000 || startup.gzip > 235_000) throw new Error(`Startup budget exceeded: ${JSON.stringify(startup)}`);
  if (homepage.gzip > 260_000) throw new Error(`Homepage budget exceeded: ${JSON.stringify(homepage)}`);
  return { startup, homepage, pricing, independentlyDeferredFeatures: deferred.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(checkBundle(process.argv[2] || 'dist'), null, 2));
}
