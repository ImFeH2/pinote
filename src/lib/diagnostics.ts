import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

export interface DiagnosticReportExport {
  destinationPath: string;
  logFileCount: number;
}

function getDiagnosticReportFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `pinote-diagnostic-report-${timestamp}.zip`;
}

function ensureZipExtension(path: string) {
  return path.toLowerCase().endsWith(".zip") ? path : `${path}.zip`;
}

export async function saveDiagnosticReport() {
  const destinationPath = await saveDialog({
    title: "Save report",
    defaultPath: getDiagnosticReportFileName(),
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  });
  if (!destinationPath) return null;
  return invoke<DiagnosticReportExport>("export_diagnostic_report", {
    destinationPath: ensureZipExtension(destinationPath),
  });
}
