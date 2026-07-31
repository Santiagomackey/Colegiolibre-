import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const mobileRoot = resolve(scriptDirectory, "..");

async function patchFile(path, transform) {
  try {
    const current = await readFile(path, "utf8");
    const next = transform(current);
    if (next !== current) await writeFile(path, next, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const androidManifest = resolve(
  mobileRoot,
  "android/app/src/main/AndroidManifest.xml"
);

const firebaseAndroidSource = resolve(
  mobileRoot,
  "firebase/google-services.json"
);
const firebaseAndroidDestination = resolve(
  mobileRoot,
  "android/app/google-services.json"
);

try {
  await mkdir(resolve(mobileRoot, "android/app"), { recursive: true });
  await copyFile(firebaseAndroidSource, firebaseAndroidDestination);
  console.log("Firebase Android configurado.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

await patchFile(androidManifest, (source) => {
  let next = source;
  if (!next.includes('android:screenOrientation="portrait"')) {
    next = next.replace(
      /(<activity\b[^>]*android:name="\.MainActivity")/,
      '$1 android:screenOrientation="portrait"'
    );
  }
  if (!next.includes('android:scheme="colegiolibre"')) {
    const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="colegiolibre"
                    android:host="auth"
                    android:pathPrefix="/callback" />
            </intent-filter>
`;
    next = next.replace("</activity>", `${filter}        </activity>`);
  }
  return next;
});

const iosPlist = resolve(mobileRoot, "ios/App/App/Info.plist");
await patchFile(iosPlist, (source) => {
  if (source.includes("<string>colegiolibre</string>")) return source;
  const urlTypes = `
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>colegiolibre</string>
			</array>
		</dict>
	</array>
`;
  return source.replace("</dict>", `${urlTypes}</dict>`);
});

console.log("Deep link y orientación nativa configurados.");
