const fs = require('node:fs');

const file = 'src/config/Backend.ts';
const source = fs.readFileSync(file, 'utf8');
const declaration = /^const PRODUCTION_BACKEND_URL = .*;$/m;
const configuredUrl = source.match(/^const PRODUCTION_BACKEND_URL = ['"]([^'"]*)['"];$/m)?.[1];
const backendUrl = process.env.BACKEND_URL?.trim() || configuredUrl;
if (!backendUrl) throw new Error('Set RELEASE_BACKEND_URL in Actions Variables or configure PRODUCTION_BACKEND_URL in the app');
let url;
try { url = new URL(backendUrl); } catch { throw new Error('The production backend URL is invalid'); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Provide a production HTTPS backend URL without credentials, query, or fragment');
}
const gradleSource = fs.readFileSync('android/app/build.gradle', 'utf8');
const configuredCode = gradleSource.match(/findProperty\("APP_VERSION_CODE"\) \?: "(\d+)"/)?.[1];
const versionCode = process.env.VERSION_CODE?.trim() || configuredCode;
if (!versionCode) {
  throw new Error('Missing RELEASE_VERSION_CODE. Add it under repository Settings > Secrets and variables > Actions > Variables, then push V2 again. Use a code higher than every Play Console upload.');
}
if (!/^[1-9]\d*$/.test(versionCode) || Number(versionCode) > 2100000000) {
  throw new Error('Version code must be a positive integer no greater than 2100000000');
}
const versionName = process.env.VERSION_NAME?.trim() || '1.0.2';
if (!/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,49}$/.test(versionName)) {
  throw new Error('Provide a version name of 1–50 letters, digits, dots, pluses, hyphens, or underscores');
}
if (!declaration.test(source)) throw new Error('Production backend declaration not found');
fs.writeFileSync(file, source.replace(declaration, () =>
  `const PRODUCTION_BACKEND_URL = ${JSON.stringify(url.href.replace(/\/$/, ''))};`));
if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `RELEASE_VERSION_CODE=${versionCode}\nRELEASE_VERSION_NAME=${versionName}\n`);
}
console.log(`Release configuration ready: version ${versionName} (code ${versionCode}).`);
