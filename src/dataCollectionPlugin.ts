import { JupyterFrontEnd, LabShell } from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { shareIcon } from '@jupyterlab/ui-components';
import { PERSISTENT_USER_ID } from '.';
import { PanelManager } from './PanelManager';
import { CompatibilityManager } from './utils/compatibility';
import { APP_ID, CommandIDs, Selectors } from './utils/constants';
import { bindRenderPendingUpdatesWidget, bindRequestCurrentPanel, createPendingUpdatesSidebar, getConnectedTeammates, groupShareFlags, PendingUpdatesSidebar } from './utils/notebookSync';
import { TeammateLocationSidebar } from './utils/teammateLocationTracker';
import { getOrigCellMapping } from './utils/utils';
import { ITeammateLocation } from './websocket/WebsocketManager';

let pendingSidebar: PendingUpdatesSidebar | null = null;
let locationSidebar: TeammateLocationSidebar | null = null;
let isPluginActivated = false;
const LOCAL_URL = 'http://localhost:1015';
export let BACKEND_API_URL = LOCAL_URL + '/send/';
export let WEBSOCKET_API_URL = LOCAL_URL;

export const dataCollectionPlugin = async (
  app: JupyterFrontEnd,
  settingRegistry: ISettingRegistry
) => {
  // Prevent multiple activations
  if (isPluginActivated) {
    console.log(`${APP_ID}: Plugin already activated, skipping...`);
    return;
  }
  isPluginActivated = true;

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

    // create the pending updates sidebar widget (only if not already created)
    if (!pendingSidebar) {
      pendingSidebar = createPendingUpdatesSidebar();
      // Binds the instance of PendingUpdatesSidebar with this function.
      bindRenderPendingUpdatesWidget(pendingSidebar);
      // rank controls position among right widgets; pick a sensible rank
      app.shell.add(pendingSidebar, 'right', { rank: 600 });
    }

    // Create the teammate location sidebar (only if not already created)
    if (!locationSidebar) {
      locationSidebar = new TeammateLocationSidebar();

      // IMPORTANT: Set up fetch callback BEFORE adding to shell
      locationSidebar.setFetchTeammateLocationsCallback(async (notebookId: string) => {
        console.log(`${APP_ID}: Fetch callback invoked for notebook:`, notebookId);
        if (!PERSISTENT_USER_ID) {
          console.log(`${APP_ID}: No PERSISTENT_USER_ID`);
          return [];
        }
        try {
          const params = new URLSearchParams({
            userId: PERSISTENT_USER_ID,
            notebookId: notebookId
          });
          const url = `${WEBSOCKET_API_URL}/groups/location/teammates?${params}`;
          console.log(`${APP_ID}: Fetching teammate locations from:`, url);

          const response = await fetch(url);
          console.log(`${APP_ID}: Response status:`, response.status);

          if (response.ok) {
            const data = await response.json();
            console.log(`${APP_ID}: Fetched teammate locations:`, data);
            return data || [];
          } else {
            console.error(`${APP_ID}: Response not OK:`, response.status);
          }
        } catch (error) {
          console.error(`${APP_ID}: Failed to fetch teammate locations:`, error);
        }
        return [];
      });

      app.shell.add(locationSidebar, 'left', { rank: 650 });
    }


    const panelManager = new PanelManager(settings, dialogShownSettings);
    bindRequestCurrentPanel(() => panelManager.panel);

    // Wire up teammate change callback to refresh sidebar
    panelManager.onTeammateChange = () => {
      console.log(`${APP_ID}: Teammate change detected, refreshing sidebars`);
      if (pendingSidebar) {
        pendingSidebar.refreshTeammates();
      }
      if (locationSidebar) {
        locationSidebar.refresh();
      }
    };

    // Wire up location tracking callbacks
    panelManager.websocketManager.onLocationUpdate((location: ITeammateLocation) => {
      console.log(`${APP_ID}: Location update received:`, location);
      if (locationSidebar) {
        locationSidebar.updateTeammateLocation(location);
      }
    });

    panelManager.websocketManager.onLocationCleared((userId: string) => {
      console.log(`${APP_ID}: Location cleared for user:`, userId);
      if (locationSidebar) {
        locationSidebar.removeTeammateLocation(userId);
      }
    });

    // Wire up cell change callback to send location updates
    panelManager.onCellChange = (cellId: string, cellIndex: number) => {
      console.log(`${APP_ID}: onCellChange callback triggered:`, { cellId, cellIndex });
      panelManager.websocketManager.sendLocationUpdate(cellId, cellIndex);
    };
    console.log(`${APP_ID}: Cell change callback registered on panelManager`);

    const labShell = app.shell as LabShell;
    labShell.add(pendingSidebar, 'right', { rank: 500 });

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
      action: 'update_cell',
      update_id: crypto.randomUUID(), // Generate unique update ID
    };
    console.log("Awaiting pusUpdateToTeammates")
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
  console.log("Sending Message")
  const notebookId = CompatibilityManager.getMetadataComp(
    panelManager.panel?.context.model,
    Selectors.notebookId
  );

  console.log("Sending Message")

  const teammateList = getConnectedTeammates(notebookId);
  console.log("Sending Message")

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
    console.log(`${APP_ID}: onConnect - NotebookPanel detected`);

    try {
      (pendingSidebar as PendingUpdatesSidebar).setCurrentPanel(panelManager.panel);
    } catch (e) {
      console.error('Failed to update pending sidebar panel', e);
    }
    try {
      if (locationSidebar) {
        console.log(`${APP_ID}: Setting notebook panel on location sidebar`);
        locationSidebar.setNotebookPanel(panelManager.panel);
      }
    } catch (e) {
      console.error('Failed to update location sidebar panel', e);
    }

  } else {
    panelManager.panel = null;
    try {
      (pendingSidebar as PendingUpdatesSidebar).setCurrentPanel(null);
    } catch (e) {
      console.error('Failed to clear pending sidebar panel', e);
    }
    try {
      if (locationSidebar) {
        locationSidebar.setNotebookPanel(null);
      }
    } catch (e) {
      console.error('Failed to clear location sidebar panel', e);
    }
  }
}
