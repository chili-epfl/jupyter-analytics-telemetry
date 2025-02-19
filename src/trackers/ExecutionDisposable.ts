import { NotebookPanel, NotebookActions, Notebook } from '@jupyterlab/notebook';
import { JSONExt, JSONObject } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';
import { Cell, CodeCell, MarkdownCell } from '@jupyterlab/cells';
import { processCellOutput } from '../utils/utils';
import { postCodeExec, postMarkdownExec } from '../api';
import { Selectors } from '../utils/constants';
import { CompatibilityManager } from '../utils/compatibility';

export class ExecutionDisposable implements IDisposable {
  constructor(panel: NotebookPanel, notebookId: string) {
    this._panel = panel;

    this._notebookId = notebookId;

    // connect to cell execution
    NotebookActions.executed.connect(this._onCellExecuted, this);

    panel.disposed.connect(() =>
      NotebookActions.executed.disconnect(this._onCellExecuted, this)
    );
  }

  private _onCellExecuted(
    sender: any,
    args: { notebook: Notebook; cell: Cell }
  ) {
    const { notebook, cell } = args;

    // only track the executions of the current panel instance
    if (notebook !== this._panel.content) {
      return;
    }
    if (cell instanceof CodeCell) {
      const executionMetadata = CompatibilityManager.getMetadataComp(
        cell.model,
        'execution'
      ) as JSONObject;
      if (executionMetadata && JSONExt.isObject(executionMetadata)) {
        const startTimeStr = (executionMetadata[
          'shell.execute_reply.started'
        ] || executionMetadata['iopub.execute_input']) as string | null;
        const endTimeStr = executionMetadata['shell.execute_reply'] as
          | string
          | null;
        const executionAborted =
          endTimeStr && !executionMetadata['iopub.execute_input'];

        if (!executionAborted) {
          if (endTimeStr && startTimeStr) {
            const outputs = cell.model.outputs.toJSON();
            const notebookModel = this._panel.model;
            const { status, cell_output_length } = processCellOutput(outputs);
            const orig_cell_id: string | undefined =
              CompatibilityManager.getMetadataComp(
                notebookModel,
                Selectors.cellMapping
              )?.find(([key]: [key: string]) => key === cell.model.id)?.[1];

            if (orig_cell_id) {
              postCodeExec({
                notebook_id: this._notebookId,
                language_mimetype:
                  CompatibilityManager.getMetadataComp(
                    notebookModel,
                    'language_info'
                  )['mimetype'] || 'text/plain',
                cell_id: cell.model.id,
                orig_cell_id: orig_cell_id,
                t_start: startTimeStr,
                t_finish: endTimeStr,
                status: status,
                cell_input: cell.model.sharedModel.getSource(),
                cell_output_model: outputs,
                cell_output_length: cell_output_length
              });
            }
          }
        }
      }
    } else if (cell instanceof MarkdownCell) {
      const orig_cell_id: string | undefined =
        CompatibilityManager.getMetadataComp(
          this._panel.model,
          Selectors.cellMapping
        )?.find(([key]: [key: string]) => key === cell.model.id)?.[1];

      if (orig_cell_id) {
        postMarkdownExec({
          notebook_id: this._notebookId,
          cell_id: cell.model.id,
          orig_cell_id: orig_cell_id,
          time: new Date().toISOString(),
          cell_content: cell.model.sharedModel.getSource()
        });
      }
    }
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this._isDisposed = true;

    Signal.clearData(this);
  }

  private _panel: NotebookPanel;
  private _isDisposed = false;
  private _notebookId: string;
}
