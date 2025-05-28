import { Signal } from '@lumino/signaling';
import { IDisposable } from '@lumino/disposable';
import { CommandRegistry } from '@lumino/commands';
import { Cell, ICellModel } from '@jupyterlab/cells';
import { Notebook, NotebookPanel } from '@jupyterlab/notebook';
import {
  postNotebookClick,
  postCellClick,
  postCellCopy,
  postCellPaste,
  postClipboardCopy,
  postClipboardPaste
} from '../api';
import { Selectors } from '../utils/constants';
import { CompatibilityManager } from '../utils/compatibility';

type ClickType = 'OFF' | 'ON';
interface ICellCopyData {
  lastCopyCellId: string;
  lastCopyNotebookId: string;
  lastCopyTime: string;
  lastCopyContent: string;
}

const CELL_COPY_ID: string = 'notebook:copy-cell';
const CELL_PASTE_ID: string = 'notebook:paste-cell-below';

export class FocusDisposable implements IDisposable {
  constructor(
    commands: CommandRegistry,
    panel: NotebookPanel,
    notebookId: string
  ) {
    this._panel = panel;

    this._notebookId = notebookId;

    this._sendNotebookClick('ON');

    // call it a first time after the panel is ready to send missed start-up signals
    this._onCellChanged(panel.content, panel.content.activeCell);

    // connect to active cell changes
    panel.content.activeCellChanged.connect(this._onCellChanged, this);

    // connect to commands executed
    commands.commandExecuted.connect(this._onCommandExecuted, this);

    // Add listener to copy and paste (to clipbaord)
    document.addEventListener('copy', this._onClipboardCopy);
    document.addEventListener('paste', this._onClipboardPaste);

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

  private _onCommandExecuted = (
    commandR: CommandRegistry,
    args: CommandRegistry.ICommandExecutedArgs
  ) => {
    if (args.id === CELL_COPY_ID) {
      this._onCopyCommandExecuted();
    } else if (args.id === CELL_PASTE_ID) {
      this._onPasteCommandExecuted();
    }
  };

  private _onCopyCommandExecuted = () => {
    console.log('A cell was copied!');
    if (this._lastActiveCellId && this._lastActiveCellContent) {
      this._cellCopyData = {
        lastCopyNotebookId: this._notebookId,
        lastCopyCellId: this._lastActiveCellId,
        lastCopyTime: new Date().toISOString(),
        lastCopyContent: this._lastActiveCellContent
      };
      this._sendCellCopy();
    }
  };

  private _onPasteCommandExecuted = () => {
    console.log('A cell was pasted!');
    this._sendCellPaste();
  };

  private _onClipboardCopy = (event: ClipboardEvent) => {
    const content = event.clipboardData?.getData('text');
    console.log('Clipboard copied ', content);
    if (content) {
      this._sendClipboardCopy(content);
    }
  };

  private _onClipboardPaste = (event: ClipboardEvent) => {
    const content = event.clipboardData?.getData('text');
    console.log('Clipboard pasted ', content);
    if (content) {
      this._sendClipboardPaste(content);
    }
  };

  private _setActiveCellAndOrigCellId = (
    activeCell: Cell<ICellModel> | null
  ) => {
    this._lastActiveCellId = activeCell?.model.sharedModel.getId();
    this._lastActiveCellContent = activeCell?.model.toJSON().source.toString();
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

  private _sendCellCopy = () => {
    if (this._cellCopyData) {
      postCellCopy({
        notebook_id: this._cellCopyData.lastCopyNotebookId,
        cell_id: this._cellCopyData.lastCopyCellId,
        time: this._cellCopyData.lastCopyTime,
        content: this._cellCopyData.lastCopyContent
      });
    }
  };

  private _sendCellPaste = () => {
    if (this._cellCopyData && this._lastActiveCellId) {
      postCellPaste({
        notebook_id: this._notebookId,
        copied_notebook_id: this._cellCopyData.lastCopyNotebookId,
        copied_cell_id: this._cellCopyData.lastCopyCellId,
        copied_time: this._cellCopyData.lastCopyTime,
        cell_id: this._lastActiveCellId,
        time: new Date().toISOString(),
        content: this._cellCopyData.lastCopyContent
      });
    }
  };

  private _sendClipboardCopy = (content: string) => {
    if (this._lastActiveCellId) {
      postClipboardCopy({
        notebook_id: this._notebookId,
        cell_id: this._lastActiveCellId,
        time: new Date().toISOString(),
        content: content
      });
    }
  };

  private _sendClipboardPaste = (content: string) => {
    if (this._lastActiveCellId) {
      postClipboardPaste({
        notebook_id: this._notebookId,
        cell_id: this._lastActiveCellId,
        time: new Date().toISOString(),
        content: content
      });
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
    this._cellCopyData = null;

    document.removeEventListener('copy', this._onClipboardCopy);
    document.removeEventListener('paste', this._onClipboardPaste);
    Signal.clearData(this);
  }

  private _isDisposed = false;
  private _panel: NotebookPanel;
  private _notebookId: string;
  private _lastActiveCellId: string | null | undefined = null;
  private _lastActiveCellContent: string | null | undefined = null;
  private _lastOrigCellId: string | null | undefined = null;
  private _cellCopyData: ICellCopyData | null | undefined = null;

  private _notebookStart: Date = new Date();
  private _cellStart: Date = new Date();
}
