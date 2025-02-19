import { Signal } from '@lumino/signaling';
import { IDisposable } from '@lumino/disposable';
import { Cell, ICellModel } from '@jupyterlab/cells';
import { Notebook, NotebookPanel } from '@jupyterlab/notebook';
import { postNotebookClick, postCellClick } from '../api';
import { Selectors } from '../utils/constants';
import { CompatibilityManager } from '../utils/compatibility';

type ClickType = 'OFF' | 'ON';

export class FocusDisposable implements IDisposable {
  constructor(panel: NotebookPanel, notebookId: string) {
    this._panel = panel;

    this._notebookId = notebookId;

    this._sendNotebookClick('ON');

    // call it a first time after the panel is ready to send missed start-up signals
    this._onCellChanged(panel.content, panel.content.activeCell);

    // connect to active cell changes
    panel.content.activeCellChanged.connect(this._onCellChanged, this);

    // panel.content is disposed before panel itself, so release the associated connection before
    panel.content.disposed.connect(this._onContentDisposed, this);
  }

  private _onContentDisposed = (content: Notebook) => {
    content.activeCellChanged.disconnect(this._onCellChanged, this);
    // directly release the content.disposed connection
    content.disposed.disconnect(this._onContentDisposed, this);
  };

  private _onCellChanged = (
    content: Notebook,
    activeCell: Cell<ICellModel> | null
  ) => {
    this._sendCellClick('OFF');

    // change both the id of the last active cell and the corresponding orig cell id
    this._setActiveCellAndOrigCellId(activeCell);

    this._sendCellClick('ON');
  };

  private _setActiveCellAndOrigCellId = (
    activeCell: Cell<ICellModel> | null
  ) => {
    this._lastActiveCellId = activeCell?.model.sharedModel.getId();
    if (this._lastActiveCellId) {
      this._lastOrigCellId = CompatibilityManager.getMetadataComp(
        this._panel?.model,
        Selectors.cellMapping
      )?.find(([key]: [key: string]) => key === this._lastActiveCellId)?.[1];
    } else {
      this._lastOrigCellId = null;
    }
  };

  private _sendCellClick = (clickType: ClickType) => {
    if (this._lastActiveCellId) {
      let cellDurationSec: number | null = null;
      if (clickType === 'ON') {
        this._cellStart = new Date();
        cellDurationSec = null;
      } else {
        const cellEnd = new Date();
        cellDurationSec =
          (cellEnd.getTime() - this._cellStart.getTime()) / 1000;
      }

      if (this._lastOrigCellId) {
        postCellClick({
          notebook_id: this._notebookId,
          cell_id: this._lastActiveCellId,
          orig_cell_id: this._lastOrigCellId,
          click_type: clickType,
          time: new Date().toISOString(),
          click_duration: cellDurationSec
        });
      }
    }
  };

  private _sendNotebookClick = (clickType: ClickType) => {
    let notebookDurationSec: number | null = null;
    if (clickType === 'ON') {
      this._notebookStart = new Date();
      notebookDurationSec = null;
    } else {
      const notebookEnd = new Date();
      notebookDurationSec =
        (notebookEnd.getTime() - this._notebookStart.getTime()) / 1000;
    }

    postNotebookClick({
      notebook_id: this._notebookId,
      click_type: clickType,
      time: new Date().toISOString(),
      click_duration: notebookDurationSec
    });
  };

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this._sendNotebookClick('OFF');
    this._sendCellClick('OFF');

    this._isDisposed = true;
    this._lastActiveCellId = null;

    Signal.clearData(this);
  }

  private _isDisposed = false;
  private _panel: NotebookPanel;
  private _notebookId: string;
  private _lastActiveCellId: string | null | undefined = null;
  private _lastOrigCellId: string | null | undefined = null;

  private _notebookStart: Date = new Date();
  private _cellStart: Date = new Date();
}
