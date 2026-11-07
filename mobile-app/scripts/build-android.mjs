import {spawnSync} from 'node:child_process';
import {copyFile,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
function run(cmd,args,cwd=root){const out=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});if(out.error)throw out.error;if(out.status!==0)process.exit(out.status||1)}
if(!process.env.ANDROID_HOME&&!process.env.ANDROID_SDK_ROOT){console.error('Set ANDROID_HOME to your Android SDK folder (platform 36 and build tools required).');process.exit(1)}
run('java',['-version']);
run(process.platform==='win32'?'npm.cmd':'npm',['run','sync']);
const release=process.argv.includes('--release');
run(process.platform==='win32'?'gradlew.bat':'./gradlew',[release?'assembleRelease':'assembleDebug'],resolve(root,'android'));
const variant=release?'release':'debug';
const source=resolve(root,`android/app/build/outputs/apk/${variant}/app-${release?'release-unsigned':'debug'}.apk`);
const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const folder=resolve(root,'artifacts');await mkdir(folder,{recursive:true});
const target=resolve(folder,`ColegioLibre-${version}-${release?'unsigned':'debug'}.apk`);await copyFile(source,target);
console.log(`APK built: ${target}`);
if(release)console.log('Sign the release with the existing production keystore before distributing it.');
