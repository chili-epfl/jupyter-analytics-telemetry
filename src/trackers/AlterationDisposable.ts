import { Signal } from '@lumino/signaling';
import { IDisposable } from '@lumino/disposable';
import { NotebookPanel } from '@jupyterlab/notebook';
import { postCellAlteration } from '../api';
import { CompatibilityManager } from '../utils/compatibility';

export class AlterationDisposable implements IDisposable {
  constructor(panel: NotebookPanel, notebookId: string) {
    this._notebookId = notebookId;
    this._cellIdList = CompatibilityManager.getCellIdsComp(
      panel.context.model.cells
    );

    // connect to notebook cell insertion/deletion/move/set
    panel.context.model.cells.changed.connect(this._onCellsAltered, this);

    // release connection
    panel.disposed.connect(this._onPanelDisposed, this);
  }

  private _onCellsAltered = (cells: any) => {
    const newCellIdList: string[] = CompatibilityManager.getCellIdsComp(cells);

    const addedIds: string[] = newCellIdList.filter(
      item => !this._cellIdList.includes(item)
    );
    const removedIds: string[] = this._cellIdList.filter(
      item => !newCellIdList.includes(item)
    );

    for (const added_id of addedIds) {
      postCellAlteration({
        notebook_id: this._notebookId,
        cell_id: added_id,
        alteration_type: 'ADD',
        time: new Date().toISOString()
      });
    }
    for (const removed_id of removedIds) {
      postCellAlteration({
        notebook_id: this._notebookId,
        cell_id: removed_id,
        alteration_type: 'REMOVE',
        time: new Date().toISOString()
      });
    }

    this._cellIdList = newCellIdList;
  };

  private _onPanelDisposed = (panel: NotebookPanel) => {
    panel.context.model.cells.changed.disconnect(this._onCellsAltered, this);
  };

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this._isDisposed = true;
    this._cellIdList = [];

    Signal.clearData(this);
  }

  private _isDisposed = false;
  private _notebookId: string;
  private _cellIdList: string[] = [];
}
