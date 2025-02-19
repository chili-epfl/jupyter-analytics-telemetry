import { Signal } from '@lumino/signaling';
import { IDisposable } from '@lumino/disposable';
import { NotebookPanel } from '@jupyterlab/notebook';
import { Selectors } from '../utils/constants';
import { CompatibilityManager } from '../utils/compatibility';

export class CellMappingDisposable implements IDisposable {
  constructor(panel: NotebookPanel) {
    this._panel = panel;

    if (panel && !panel.isDisposed) {
      // only track and compute the cell mapping for tagged notebooks
      if (
        CompatibilityManager.getMetadataComp(
          panel.context.model,
          Selectors.notebookId
        ) &&
        CompatibilityManager.getMetadataComp(
          panel.context.model,
          Selectors.cellMapping
        )
      ) {
        this._cellIdList = CompatibilityManager.getCellIdsComp(
          panel.context.model.cells
        );
        panel.context.model.cells.changed.connect(this._onCellsAltered, this);

        // release connection
        panel.disposed.connect(this._onPanelDisposed, this);
      }
    }
  }

  private _onPanelDisposed = (panel: NotebookPanel) => {
    panel.context.model.cells.changed.disconnect(this._onCellsAltered, this);
  };

  private _hasCellListChanged = (
    newList: string[],
    oldList: string[]
  ): boolean => {
    if (newList.length !== oldList.length) {
      return true;
    }
    for (let i = 0; i < newList.length; i++) {
      if (newList[i] !== oldList[i]) {
        return true;
      }
    }
    return false;
  };

  private _updateCellMapping = (newCellIdList: string[]) => {
    // retrieves the mapping from the metadata
    const cellMapping: [string, string][] | null | undefined =
      CompatibilityManager.getMetadataComp(
        this._panel?.model,
        Selectors.cellMapping
      );
    if (!cellMapping) {
      return;
    }
    const newCellMapping: [string, string][] = [];
    // for all the current notebook cell ids, assign an original cell id
    for (const [index, cId] of newCellIdList.entries()) {
      const mapping = cellMapping.find(([key, value]) => key === cId);
      // if the id was already part of the previous mapping, keep the mapped cell id
      if (mapping) {
        newCellMapping.push(mapping);
      } else {
        // there is a new cell id
        if (index > 0) {
          // if it's not the top cell, use the mapped id of the cell above
          const previousMapping = newCellMapping[index - 1];
          newCellMapping.push([cId, previousMapping[1]]);
        } else {
          // this is the top cell, use the mapped id of the previous mapping top cell
          const origTopMapping = cellMapping[0];
          newCellMapping.push([cId, origTopMapping[1]]);
        }
      }
    }
    CompatibilityManager.setMetadataComp(
      this._panel?.model,
      Selectors.cellMapping,
      newCellMapping
    );
  };

  private _onCellsAltered = (cells: any) => {
    const newCellIdList: string[] = CompatibilityManager.getCellIdsComp(cells);
    if (this._panel?.context.isReady) {
      if (this._hasCellListChanged(newCellIdList, this._cellIdList)) {
        this._updateCellMapping(newCellIdList);
      }
    }

    this._cellIdList = newCellIdList;
  };

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this._isDisposed = true;
    this._panel = null;
    this._cellIdList = [];

    Signal.clearData(this);
  }

  private _isDisposed = false;
  private _panel: NotebookPanel | null;
  private _cellIdList: string[] = [];
}
