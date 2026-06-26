import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const notes = [];

const fail = (message) => failures.push(message);
const pass = (message) => notes.push(message);

const configToml = read("supabase/config.toml");
const packageJson = JSON.parse(read("package.json"));
const apiConfig = read("src/config/api.ts");
const appRoutes = read("src/App.tsx");
const appSidebar = read("src/components/AppSidebar.tsx");
const individualLayout = read("src/pages/IndividualLayout.tsx");
const recordPage = read("src/pages/RecordPage.tsx");

const configuredFunctions = [...configToml.matchAll(/\[functions\.([^\]]+)\]/g)].map((match) => match[1]).sort();
const functionFolders = fs
  .readdirSync(path.join(root, "supabase/functions"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();
const edgeFunctionValues = [...apiConfig.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]).sort();
const deployScript = packageJson.scripts?.["deploy:functions"] || "";
const deployMatch = deployScript.match(/supabase functions deploy\s+(.+?)(?:\s+--|$)/);
const deployFunctions = deployMatch ? deployMatch[1].trim().split(/\s+/).filter(Boolean).sort() : [];

for (const functionName of configuredFunctions) {
  if (!functionFolders.includes(functionName)) fail(`supabase/config.toml -> ${functionName} klasörü yok.`);
  if (!deployFunctions.includes(functionName)) fail(`deploy:functions script'i ${functionName} fonksiyonunu deploy etmiyor.`);
  const indexPath = `supabase/functions/${functionName}/index.ts`;
  if (exists(indexPath)) {
    const source = read(indexPath);
    if (!source.includes("healthResponse(")) fail(`${functionName} standard healthResponse kontratını desteklemiyor.`);
  }
}

for (const functionName of edgeFunctionValues) {
  if (!configuredFunctions.includes(functionName)) fail(`EDGE_FUNCTIONS.${functionName} supabase/config.toml içinde yok.`);
  if (!functionFolders.includes(functionName)) fail(`EDGE_FUNCTIONS.${functionName} için function klasörü yok.`);
}

for (const folderName of functionFolders) {
  if (!configuredFunctions.includes(folderName)) fail(`${folderName} function klasörü supabase/config.toml içinde yok.`);
}

const allDashboardRoutes = [
  "/dashboard",
  "/dashboard/record",
  "/dashboard/upload",
  "/dashboard/zoom-import",
  "/dashboard/meetings",
  "/dashboard/company",
  "/dashboard/company/profile",
  "/dashboard/company/radar",
  "/dashboard/advisor",
  "/dashboard/executive",
  "/dashboard/analytics",
  "/dashboard/reports",
  "/dashboard/integrations",
  "/dashboard/billing",
  "/dashboard/settings",
];

const allIndividualRoutes = [
  "/individual",
  "/individual/practice",
  "/individual/history",
  "/individual/daily",
  "/individual/coach",
  "/individual/profile",
  "/individual/analysis",
  "/individual/settings",
];

const hasRoute = (route) => {
  if (route === "/dashboard") return appRoutes.includes('path="/dashboard"') && appRoutes.includes("<Route index element={<DashboardHome");
  if (route === "/individual") return appRoutes.includes('path="/individual"') && appRoutes.includes("<Route index element={<IndividualHome");
  if (route.startsWith("/dashboard/")) {
    const nested = route.replace("/dashboard/", "");
    return appRoutes.includes(`path="${nested}"`);
  }
  if (route.startsWith("/individual/")) {
    const nested = route.replace("/individual/", "");
    return appRoutes.includes(`path="${nested}"`);
  }
  return appRoutes.includes(`path="${route}"`);
};

for (const route of [...allDashboardRoutes, ...allIndividualRoutes]) {
  if (!hasRoute(route)) fail(`${route} route karşılığı App.tsx içinde bulunamadı.`);
}

const sidebarLinks = [...appSidebar.matchAll(/to:\s*"([^"]+)"/g)].map((match) => match[1]);
const individualLinks = [...individualLayout.matchAll(/to:\s*"([^"]+)"/g)].map((match) => match[1]);

for (const link of sidebarLinks) {
  if (!hasRoute(link)) fail(`Kurumsal sidebar linki route'a bağlı değil: ${link}`);
}

for (const link of individualLinks) {
  if (!hasRoute(link)) fail(`Bireysel sidebar linki route'a bağlı değil: ${link}`);
}

if (!appRoutes.includes('path="upload"') || !appRoutes.includes("/dashboard/record?mode=file")) {
  fail("/dashboard/upload legacy alias'i /dashboard/record?mode=file hedefine bağlı değil.");
}

if (!appRoutes.includes('path="zoom-import"') || !appRoutes.includes("/dashboard/record?mode=zoom")) {
  fail("/dashboard/zoom-import legacy alias'i /dashboard/record?mode=zoom hedefine bağlı değil.");
}

if (!recordPage.includes("useSearchParams") || !recordPage.includes("normalizeAnalysisMode") || !recordPage.includes('["live", "file", "zoom", "meet"]')) {
  fail("RecordPage mode=live|file|zoom|meet query interface'i eksik.");
}

if (!appRoutes.includes("IntegrationsPage") || !sidebarLinks.includes("/dashboard/integrations")) {
  fail("/dashboard/integrations route'u veya sidebar linki eksik.");
}

if (failures.length > 0) {
  console.error("Readiness check failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

pass(`${configuredFunctions.length} Supabase function config/deploy/health kapsamı doğrulandı.`);
pass(`${sidebarLinks.length} kurumsal ve ${individualLinks.length} bireysel sidebar linki route karşılığıyla doğrulandı.`);
pass("RecordPage query mode ve legacy aliaslar doğrulandı.");

console.log("Readiness check passed:");
for (const item of notes) console.log(`- ${item}`);
