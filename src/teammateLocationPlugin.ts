import { JupyterFrontEnd, LabShell } from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { PERSISTENT_USER_ID } from '.';
import { WEBSOCKET_API_URL } from './dataCollectionPlugin';
import { PanelManager } from './PanelManager';
import { APP_ID } from './utils/constants';
import { TeammateLocationSidebar } from './utils/teammateLocationTracker';
import { ITeammateLocation } from './websocket/WebsocketManager';

let locationSidebar: TeammateLocationSidebar | null = null;

export const teammateLocationPlugin = (
  app: JupyterFrontEnd,
  panelManager: PanelManager
) => {
  // Create the teammate location sidebar (only if not already created)
  if (!locationSidebar) {
    locationSidebar = new TeammateLocationSidebar();

    // IMPORTANT: Set up fetch callback BEFORE adding to shell
    locationSidebar.setFetchTeammateLocationsCallback(
      async (notebookId: string) => {
        console.log(
          `${APP_ID}: Fetch callback invoked for notebook:`,
          notebookId
        );
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
          console.error(
            `${APP_ID}: Failed to fetch teammate locations:`,
            error
          );
        }
        return [];
      }
    );

    app.shell.add(locationSidebar, 'left', { rank: 650 });
  }

  // Wire up location tracking callbacks
  panelManager.websocketManager.onLocationUpdate(
    (location: ITeammateLocation) => {
      console.log(`${APP_ID}: Location update received:`, location);
      if (locationSidebar) {
        locationSidebar.updateTeammateLocation(location);
      }
    }
  );

  panelManager.websocketManager.onLocationCleared((userId: string) => {
    console.log(`${APP_ID}: Location cleared for user:`, userId);
    if (locationSidebar) {
      locationSidebar.removeTeammateLocation(userId);
    }
  });

  // Wire up cell change callback to send location updates
  panelManager.onCellChange = (cellId: string, cellIndex: number) => {
    console.log(`${APP_ID}: onCellChange callback triggered:`, {
      cellId,
      cellIndex
    });
    panelManager.websocketManager.sendLocationUpdate(cellId, cellIndex);
  };
  console.log(`${APP_ID}: Cell change callback registered on panelManager`);

  // Listen for panel changes
  const labShell = app.shell as LabShell;
  if (labShell) {
    labShell.currentChanged.connect(() => {
      const widget = labShell.currentWidget;
      if (widget instanceof NotebookPanel) {
        locationSidebar?.setNotebookPanel(widget);
      } else {
        locationSidebar?.setNotebookPanel(null);
      }
    });
  }
};

// Export for external access if needed
export const getLocationSidebar = (): TeammateLocationSidebar | null =>
  locationSidebar;

// Refresh the location sidebar
export const refreshLocationSidebar = () => {
  if (locationSidebar) {
    locationSidebar.refresh();
  }
};
