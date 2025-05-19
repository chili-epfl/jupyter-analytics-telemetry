import { JupyterFrontEnd, LabShell } from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { NotebookPanel } from '@jupyterlab/notebook';
import { shareIcon } from '@jupyterlab/ui-components';

import { PanelManager } from './PanelManager';
import { APP_ID, CommandIDs } from './utils/constants';
import { CompatibilityManager } from './utils/compatibility';
import { Selectors } from './utils/constants';
import { getOrigCellMapping } from './utils/utils';
import { groupShareFlags, getConnectedTeammates } from './utils/notebookSync';

const LOCAL_URL = 'http://localhost:1015';
export let BACKEND_API_URL = LOCAL_URL + '/send/';
export let WEBSOCKET_API_URL = LOCAL_URL;

export const dataCollectionPlugin = async (
  app: JupyterFrontEnd,
  settingRegistry: ISettingRegistry
) => {
  // to record duration of code executions, enable the recording of execution timing (JupyterLab default setting)
  settingRegistry
    .load('@jupyterlab/notebook-extension:tracker')
    .then((nbTrackerSettings: ISettingRegistry.ISettings) => {
      nbTrackerSettings.set('recordTiming', true);
    })
    .catch(error =>
      console.log(
        `${APP_ID}: Could not force cell execution metadata recording: ${error}`
      )
    );

  try {
    // wait for this extension's settings to load
    const [settings, dialogShownSettings, endpointSettings] = await Promise.all(
      [
        settingRegistry.load(`${APP_ID}:settings`),
        settingRegistry.load(`${APP_ID}:dialogShownSettings`),
        settingRegistry.load(`${APP_ID}:endpoint`)
      ]
    );

    onEndpointChanged(endpointSettings);
    endpointSettings.changed.connect(onEndpointChanged);

    const panelManager = new PanelManager(settings, dialogShownSettings);

    const labShell = app.shell as LabShell;

    // update the panel when the active widget changes
    if (labShell) {
      labShell.currentChanged.connect(() => onConnect(labShell, panelManager));
    }

    app.commands.addCommand(CommandIDs.pushCellUpdate, {
      label: 'Share the Selected Cell',
      caption: 'Share the selected cell with the connected teammates',
      icon: shareIcon,
      isVisible: () => panelManager.panel !== null,
      isEnabled: () => {
        const panel = panelManager.panel;
        if (panel) {
          const notebookId = CompatibilityManager.getMetadataComp(
            panel.context.model,
            Selectors.notebookId
          );
          return groupShareFlags.get(notebookId) ?? false;
        }
        return false;
      },
      execute: () => pushCellUpdate(panelManager)
    });

    app.contextMenu.addItem({
      type: 'separator',
      selector: '.jp-Cell'
    });

    app.contextMenu.addItem({
      command: CommandIDs.pushCellUpdate,
      selector: '.jp-Cell'
    });

    // connect to current widget
    void app.restored.then(() => {
      onConnect(labShell, panelManager);
    });
  } catch (error) {
    console.log(`${APP_ID}: Could not load settings, error: ${error}`);
  }
};

const pushCellUpdate = async (panelManager: PanelManager) => {
  const notebookPanel = panelManager.panel;
  const notebook = panelManager.panel?.content;
  const cell = notebook?.activeCell;

  if (notebookPanel && notebook && cell) {
    const model = cell.model;

    const origCellMapping = getOrigCellMapping(notebookPanel);
    const cellId = origCellMapping[notebook.activeCellIndex];

    // Use the minimal cell representation
    const minimalCell = {
      id: cellId,
      cell_type: model.type,
      source: model.toJSON().source
    };

    const payload = {
      content: minimalCell,
      action: 'update_cell'
    };

    await pushUpdateToTeammates(panelManager, JSON.stringify(payload));
  }
};

const pushUpdateToTeammates = async (
  panelManager: PanelManager,
  message: any
) => {
  if (!panelManager.websocketManager) {
    console.error('No websocket manager found');
    return;
  }

  const notebookId = CompatibilityManager.getMetadataComp(
    panelManager.panel?.context.model,
    Selectors.notebookId
  );
  const teammateList = getConnectedTeammates(notebookId);

  if ((await teammateList).length === 0) {
    console.log('No connected teammates');
    return;
  }

  for (const userId of await teammateList) {
    panelManager.websocketManager.sendMessageToTeammates(userId, message);
  }
};

function onEndpointChanged(settings: ISettingRegistry.ISettings) {
  const useLocalBackend = settings.composite.useLocalBackend;
  const backendEndpoint = settings.composite.backendEndpoint;
  if (useLocalBackend) {
    BACKEND_API_URL = LOCAL_URL + '/send/';
    WEBSOCKET_API_URL = LOCAL_URL;
  } else if (typeof backendEndpoint === 'string') {
    BACKEND_API_URL = backendEndpoint + '/send/';
    WEBSOCKET_API_URL = backendEndpoint;
  } else {
    // default
    BACKEND_API_URL = LOCAL_URL + '/send/';
    WEBSOCKET_API_URL = LOCAL_URL;
  }
}

function onConnect(labShell: LabShell, panelManager: PanelManager) {
  const widget = labShell.currentWidget;
  if (!widget) {
    return;
  }

  if (widget instanceof NotebookPanel) {
    const notebookPanel = widget as NotebookPanel;
    panelManager.panel = notebookPanel;
  } else {
    panelManager.panel = null;
  }
}
