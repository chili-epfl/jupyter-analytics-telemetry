import { INotebookModel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

// class that computes values that are impacted by API breaking changes between the multiple JupyterLab versions
// the jupyterVersion is set when the extension plugin is activated and is provided here so all static methods can read it
export class CompatibilityManager {
  private static _jupyterVersion: number | null = null;

  static setJupyterVersion(version: number): void {
    CompatibilityManager._jupyterVersion = version;
  }

  static checkJupyterVersionSet(): void {
    if (CompatibilityManager._jupyterVersion === null) {
      throw new Error(
        'JupyterLab version is not set in CompatibilityManager before trying to access it.'
      );
    }
  }

  static getMetadataComp = (
    model: INotebookModel | ICellModel | null | undefined,
    key: string
  ): any => {
    CompatibilityManager.checkJupyterVersionSet();

    if (CompatibilityManager._jupyterVersion === 4) {
      return (model as any)?.getMetadata(key);
    } else {
      return (model?.metadata as any)?.get(key);
    }
  };

  static setMetadataComp = (
    model: INotebookModel | ICellModel | null | undefined,
    key: string,
    value: any
  ): void => {
    CompatibilityManager.checkJupyterVersionSet();

    if (CompatibilityManager._jupyterVersion === 4) {
      (model as any)?.setMetadata(key, value);
    } else {
      (model?.metadata as any)?.set(key, value);
    }
  };

  static getCellIdsComp = (cells: any): string[] => {
    CompatibilityManager.checkJupyterVersionSet();

    return Array.from(
      { length: cells.length },
      (_, index) => cells.get(index).id
    );
  };
}
