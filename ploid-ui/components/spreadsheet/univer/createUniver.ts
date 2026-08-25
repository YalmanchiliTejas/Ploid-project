import { LocaleType, createUniver, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import UniverSheetsDataValidationEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";

export function createSpreadsheet(container: HTMLElement) {
  return createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        UniverSheetsDataValidationEnUS,
      ),
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        header: false,
        toolbar: false,
        formulaBar: true,
        footer: { sheetBar: false, statisticBar: true },
        menu: {
          "sheet.operation.insert-hyper-link-toolbar": { hidden: true },
          "sheet.operation.insert-hyper-link-toolbar-zen-editor": {
            hidden: true,
          },
        },
      }),
      UniverSheetsHyperLinkPreset({
        urlHandler: {
          navigateToOtherWebsite: (url) =>
            window.open(url, "_blank", "noopener,noreferrer"),
        },
      }),
      UniverSheetsDataValidationPreset({
        showEditOnDropdown: false,
        showSearchOnDropdown: true,
      }),
    ],
  });
}
