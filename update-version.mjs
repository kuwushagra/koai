import fs from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+.\d+.\d+$/.test(version)) { console.error("Usage: node update-version.mjs 1.0.1"); process.exit(1); }

try { const packagePath = "package.json"; const packageJson = JSON.parse( fs.readFileSync(packagePath, "utf8") );

packageJson.version = version;

fs.writeFileSync(
    packagePath,
    JSON.stringify(packageJson, null, 2) + "\n"
);

const cargoPath = "src-tauri/Cargo.toml";
const cargo = fs.readFileSync(cargoPath, "utf8");

const updatedCargo = cargo.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`
);

if (updatedCargo === cargo) {
    throw new Error("Could not find package version in Cargo.toml");
}

fs.writeFileSync(cargoPath, updatedCargo);

const tauriPath = "src-tauri/tauri.conf.json";
const tauri = JSON.parse(
    fs.readFileSync(tauriPath, "utf8")
);

tauri.version = version;

fs.writeFileSync(
    tauriPath,
    JSON.stringify(tauri, null, 2) + "\n"
);

console.log(`All versions successfully updated to ${version}`);


} catch (error) { console.error("Version update failed:", error.message); process.exit(1); }