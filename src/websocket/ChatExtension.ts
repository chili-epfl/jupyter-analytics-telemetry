import { DocumentRegistry } from '@jupyterlab/docregistry';
import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';
import { CommandRegistry } from '@lumino/commands';
import { CommandIDs, Selectors } from '../utils/constants';
import { ToolbarButton } from '@jupyterlab/apputils';
import { chatIcon } from '../icons';
import { IDisposable } from '@lumino/disposable';
import { CompatibilityManager } from '../utils/compatibility';
import { isNotebookValid } from '../utils/utils';
import { Signal } from '@lumino/signaling';

export class NotebookButton
  implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
{
  private _commands: CommandRegistry;

  constructor(commands: CommandRegistry) {
    this._commands = commands;
  }

  createNew(
    panel: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>
  ): IDisposable {
    return new ChatExtensionDisposable(panel, this._commands);
  }
}

class ChatExtensionDisposable implements IDisposable {
  constructor(panel: NotebookPanel, commands: CommandRegistry) {
    /*

    INSTEAD, TRY labShell.widgetChanged connect => know when the panel is active
    When panel active => add Button + start websocket
    When panel not active => check if still Button and dispose, remove websocket
    When panel disposed => dispose Button + remove websocket

    */

    this._panel = panel;
    this._commands = commands;

    this._button = new ToolbarButton({
      className: 'open-chat-button',
      icon: chatIcon,
      onClick: () => {
        this._commands.execute(CommandIDs.dashboardOpenChat, {
          notebookId: CompatibilityManager.getMetadataComp(
            panel.model,
            Selectors.notebookId
          )
        });
      },
      tooltip: 'Open Unianalytics Chat'
    });

    panel.context.ready.then(() => {
      if (isNotebookValid(panel)) {
        panel.toolbar.insertItem(10, 'openUnianalyticsChat', this._button);
      }
    });
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this._button.dispose();

    this._isDisposed = true;

    Signal.clearData(this);
  }

  private _panel: NotebookPanel;
  private _button: ToolbarButton;
  private _commands: CommandRegistry;
  private _isDisposed = false;
}
