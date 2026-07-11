import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import i18n from "@/i18n";

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
    title: i18n.t("diagnostics.dialog.title", { ns: "settings" }),
    defaultPath: getDiagnosticReportFileName(),
    filters: [
      { name: i18n.t("diagnostics.dialog.zipArchive", { ns: "settings" }), extensions: ["zip"] },
    ],
  });
  if (!destinationPath) return null;
  return invoke<DiagnosticReportExport>("export_diagnostic_report", {
    destinationPath: ensureZipExtension(destinationPath),
  });
}
