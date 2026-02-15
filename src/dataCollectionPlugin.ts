import { JupyterFrontEnd, LabShell } from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PanelManager } from './PanelManager';
import {
  notebookSyncPlugin,
  refreshPendingSidebar
} from './notebookSyncPlugin';
import {
  refreshLocationSidebar,
  teammateLocationPlugin
} from './teammateLocationPlugin';
import { APP_ID } from './utils/constants';

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

    // Create the panel manager (core data collection)
    const panelManager = new PanelManager(settings, dialogShownSettings);

    // Wire up teammate change callback to refresh sidebars
    panelManager.onTeammateChange = () => {
      refreshPendingSidebar();
      refreshLocationSidebar();
    };

    const labShell = app.shell as LabShell;

    // Update the panel when the active widget changes
    if (labShell) {
      labShell.currentChanged.connect(() => onConnect(labShell, panelManager));
    }

    // Connect to current widget on restore
    void app.restored.then(() => {
      onConnect(labShell, panelManager);
    });

    // Initialize other plugins (sync and location tracking)
    notebookSyncPlugin(app, panelManager);
    teammateLocationPlugin(app, panelManager);
  } catch (error) {
    console.log(`${APP_ID}: Could not load settings, error: ${error}`);
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
    panelManager.panel = widget;
    console.log(`${APP_ID}: onConnect - NotebookPanel detected`);
  } else {
    panelManager.panel = null;
  }
}
