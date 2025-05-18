import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { WebsocketManager } from './websocket/WebsocketManager';
import { isNotebookValid } from './utils/utils';
import {
  handleSyncMessage,
  checkGroupSharePermission
} from './utils/notebookSync';
import { EXTENSION_SETTING_NAME } from './utils/constants';
import { CellMappingDisposable } from './trackers/CellMappingDisposable';
import { ExecutionDisposable } from './trackers/ExecutionDisposable';
import { AlterationDisposable } from './trackers/AlterationDisposable';
import { FocusDisposable } from './trackers/FocusDisposable';
import { disabledNotebooksSignaler } from '.';

export class PanelManager {
  constructor(
    settings: ISettingRegistry.ISettings,
    dialogShownSettings: ISettingRegistry.ISettings
  ) {
    this._panel = null;

    this._isDataCollectionEnabled = settings.get(EXTENSION_SETTING_NAME)
      .composite as boolean;
    settings.changed.connect(this._onSettingsChanged.bind(this));

    disabledNotebooksSignaler.valueChanged.connect(
      this._addOptionalTrackers.bind(this)
    );

    this._settings = settings;
    this._dialogShownSettings = dialogShownSettings;

    this._websocketManager = new WebsocketManager();
  }

  private _onSettingsChanged(settings: ISettingRegistry.ISettings) {
    this._isDataCollectionEnabled = settings.get(EXTENSION_SETTING_NAME)
      .composite as boolean;
  }

  get websocketManager(): WebsocketManager {
    return this._websocketManager;
  }

  get panel(): NotebookPanel | null {
    return this._panel;
  }

  set panel(value: NotebookPanel | null) {
    // if the panel (or the absence of panel) hasn't changed
    if (this._panel === value) {
      return;
    }

    if (this._panel) {
      this._panel.disposed.disconnect(this._onPanelDisposed, this);
    }

    this._disposeFromAllTrackers();

    this._panel = value;

    if (this._panel) {
      this._panel.disposed.connect(this._onPanelDisposed, this);
    }

    // if there is no panel, return...
    if (!this._panel) {
      return;
    }

    // to make sure the panel hasn't changed by the time the context is ready
    const scopeId = crypto.randomUUID();
    this._ongoingContextId = scopeId;
    // wait for the panel session context to be ready for the metadata to be available
    this._panel.sessionContext.ready.then(() => {
      if (
        this._ongoingContextId === scopeId &&
        this._panel &&
        !this._panel.isDisposed
      ) {
        this._addAllTrackers();
      }
    });
  }

  private _addAllTrackers() {
    if (this._panel && this._panel.sessionContext.isReady) {
      this._cellMappingDisposable = new CellMappingDisposable(this._panel);

      this._addOptionalTrackers();
    }
  }

  private _addOptionalTrackers() {
    this._disposeFromOptionalTrackers();
    if (this._panel && this._panel.sessionContext.isReady) {
      // check if notebook is tagged
      const notebookId = isNotebookValid(this._panel);
      if (notebookId) {
        // prompt the user with a dialog box to enable/disable the extension (opt-in) the first time they see a tagged notebook
        this._showConsentDialogPromise().then(() => {
          if (
            this._panel &&
            !this._panel.isDisposed &&
            this._isDataCollectionEnabled
          ) {
            this._focusDisposable = new FocusDisposable(
              this._panel,
              notebookId
            );

            this._executionDisposable = new ExecutionDisposable(
              this._panel,
              notebookId
            );

            this._alterationDisposable = new AlterationDisposable(
              this._panel,
              notebookId
            );

            // Establish the socket connection and pass the message handler
            this._websocketManager.establishSocketConnection(
              notebookId,
              (message, sender) => {
                if (this._panel) {
                  handleSyncMessage(this._panel, message, sender);
                }
              }
            );

            // Check if the user has permission to push notebook changes
            checkGroupSharePermission(notebookId);
          }
        });
      }
    }
  }

  private async _showConsentDialogPromise() {
    // setting only used to persist over sessions if the Dialog box has ever been shown
    const dialogShown = this._dialogShownSettings.get('DialogShown')
      .composite as boolean;

    // simply go through if the consent box has been show before
    if (dialogShown) {
      return;
    } else {
      const result = await showDialog({
        title: 'Unianalytics Data',
        // to disable the user from clicking away or pressing ESC to cancel the Dialog box
        hasClose: false,
        body: 'Enable anonymous collection of interaction data in specific notebooks to make it easier for your teacher(s) to support your learning?',
        buttons: [
          Dialog.okButton({ label: 'Yes' }),
          Dialog.cancelButton({ label: 'No' })
        ]
      });

      // update the setting to indicate that the dialog has been shown and should not be show again
      await this._dialogShownSettings.set('DialogShown', true);

      let isEnabled = false;
      if (result.button.accept) {
        // user clicked 'Yes', enable the data collection
        await this._settings.set(EXTENSION_SETTING_NAME, true);
        isEnabled = true;
      } else {
        // user clicked 'No', disable the data collection
        await this._settings.set(EXTENSION_SETTING_NAME, false);
        isEnabled = false;
      }
      // setting update might happen after the first cell and notebook clicks are sent, so call the update directly
      this._isDataCollectionEnabled = isEnabled;
    }
  }

  private _disposeFromAllTrackers() {
    if (this._cellMappingDisposable) {
      this._cellMappingDisposable.dispose();
      this._cellMappingDisposable = null;
    }
    this._disposeFromOptionalTrackers();
  }

  private _disposeFromOptionalTrackers() {
    this._websocketManager.closeSocketConnection();

    if (this._executionDisposable) {
      this._executionDisposable.dispose();
      this._executionDisposable = null;
    }
    if (this._alterationDisposable) {
      this._alterationDisposable.dispose();
      this._alterationDisposable = null;
    }
    if (this._focusDisposable) {
      this._focusDisposable.dispose();
      this._focusDisposable = null;
    }
  }

  private _onPanelDisposed(_panel: NotebookPanel) {
    this._disposeFromAllTrackers();
    // when the panel is disposed, dispose from the panel (calling the _panel setter)
    this.panel = null;
  }

  private _panel: NotebookPanel | null;
  private _ongoingContextId = '';
  private _websocketManager: WebsocketManager;
  private _isDataCollectionEnabled: boolean;
  private _settings: ISettingRegistry.ISettings;
  private _dialogShownSettings: ISettingRegistry.ISettings;

  private _cellMappingDisposable: CellMappingDisposable | null = null;
  private _executionDisposable: ExecutionDisposable | null = null;
  private _alterationDisposable: AlterationDisposable | null = null;
  private _focusDisposable: FocusDisposable | null = null;
}
