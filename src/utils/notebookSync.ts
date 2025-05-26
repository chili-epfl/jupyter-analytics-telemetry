import { NotebookPanel, NotebookActions } from '@jupyterlab/notebook';

import { PERSISTENT_USER_ID } from '..';
import { APP_ID } from './constants';
import { WEBSOCKET_API_URL } from '../dataCollectionPlugin';
import { getOrigCellMapping } from './utils';

// Sync action type constants
const UPDATE_CELL_ACTION = 'update_cell';
const UPDATE_NOTEBOOK_ACTION = 'update_notebook';

// Type of the expected message payload
interface ISyncMessagePayload {
  action: typeof UPDATE_CELL_ACTION | typeof UPDATE_NOTEBOOK_ACTION;
  content: any;
}

// Function to handle the 'chat' message and trigger updates
export const handleSyncMessage = (
  notebookPanel: NotebookPanel,
  message: string,
  sender: string
) => {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) {
    console.error('No JSON found in payload:', message);
    return;
  }

  const jsonStr = message.slice(jsonStart);
  try {
    const jsonParsed: ISyncMessagePayload = JSON.parse(jsonStr);
    if (jsonParsed.action === UPDATE_CELL_ACTION) {
      const contentJson = { cells: [jsonParsed.content] };
      showUpdateNotification(
        notebookPanel,
        contentJson,
        jsonParsed.action,
        sender
      );
    } else if (jsonParsed.action === UPDATE_NOTEBOOK_ACTION) {
      const contentJson = jsonParsed.content;
      showUpdateNotification(
        notebookPanel,
        contentJson,
        jsonParsed.action,
        sender
      );
    }
  } catch (error) {
    console.error('Error parsing JSON from sync message:', error, message);
  }
};

function showUpdateNotification(
  notebookPanel: NotebookPanel,
  newContent: any,
  action: typeof UPDATE_CELL_ACTION | typeof UPDATE_NOTEBOOK_ACTION,
  sender: string
) {
  // Future: add a diff view of the changes
  let notificationTitle = 'Notebook Updated';
  const notificationNote =
    '(Note: your code will be kept in its original cell.)';
  let notificationBody = `Your ${sender} updated this notebook. Would you like to get the latest version?`;
  if (action === UPDATE_CELL_ACTION) {
    notificationTitle = 'Cell Updated';
    notificationBody = `Your ${sender} updated a cell in this notebook. Would you like to get the latest version?`;
  } else if (action === UPDATE_NOTEBOOK_ACTION) {
    notificationTitle = 'Notebook Updated';
    notificationBody = `Your ${sender} updated the entire notebook. Would you like to get the latest version?`;
  } else {
    console.error('Unknown action type:', action);
    return;
  }
  const id = Math.random().toString(36).substring(2, 15);
  const notificationHTML = `
      <div id="update-notification-${id}" class="notification">
        <p style="font-weight: bold;">${notificationTitle}</p>
        <p>${notificationBody}</p>
        <p>${notificationNote}</p>
        <div class="notification-button-container">
          <button id="update-${id}-button" class="notification-accept-button">Update Now</button>
          <button id="close-${id}-button" class="notification-close-button">Close</button>
        </div>
      </div>
    `;
  document.body.insertAdjacentHTML('beforeend', notificationHTML);
  const notificationDiv = document.getElementById(`update-notification-${id}`);
  const updateButton = document.getElementById(`update-${id}-button`);
  const closeButton = document.getElementById(`close-${id}-button`);
  if (updateButton) {
    updateButton.addEventListener('click', async () => {
      await updateNotebookContent(notebookPanel, newContent);
      if (notificationDiv) {
        notificationDiv.remove();
      }
    });
  }
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (notificationDiv) {
        notificationDiv.remove();
      }
    });
  }
}

async function updateNotebookContent(
  notebookPanel: NotebookPanel,
  newContent: any
) {
  try {
    const cellUpdates =
      typeof newContent === 'string'
        ? JSON.parse(newContent).cells
        : newContent.cells;

    const origCellMapping = getOrigCellMapping(notebookPanel);
    const notebook = notebookPanel.content;
    const timeReceived = new Date().toLocaleString();

    for (const cellUpdate of cellUpdates) {
      const cellIndex = origCellMapping.lastIndexOf(cellUpdate.id);
      const cellType = cellUpdate.cell_type || 'code';
      let cellUpdateSource = '';
      if (cellType === 'markdown') {
        cellUpdateSource = `CELL RECEIVED AT ${timeReceived}\n\n${cellUpdate.source}`;
      } else {
        cellUpdateSource = `# CELL RECEIVED AT ${timeReceived}\n\n${cellUpdate.source}`;
      }

      // If not found, insert a new cell at the end
      if (cellIndex === -1) {
        cellUpdate.source = cellUpdateSource;
        notebook.model?.sharedModel.addCell(cellUpdate);
        continue;
      }

      // Insert a new cell with the updated content below the existing one(s)
      notebook.activeCellIndex = cellIndex;
      NotebookActions.insertBelow(notebook);
      if (cellType === 'markdown') {
        NotebookActions.changeCellType(notebook, 'markdown'); // insertBelow only creates code cells
      }

      const newCellIndex = cellIndex + 1;
      const insertedCell = notebook.widgets[newCellIndex];
      insertedCell.model.sharedModel.setSource(cellUpdateSource);

      notebook.activeCellIndex = newCellIndex;
      notebook.mode = 'command';
      notebook.scrollToItem(newCellIndex, 'center');
    }
  } catch (error) {
    console.error('Failed to update notebook content:', error);
  }
}

const getUserGroup = async (notebookId: string): Promise<string[]> => {
  if (!PERSISTENT_USER_ID) {
    console.log(`${APP_ID}: No user id`);
    return [];
  }
  const url = `${WEBSOCKET_API_URL}/groups/users/${PERSISTENT_USER_ID}/groups/names?notebookId=${encodeURIComponent(notebookId)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch groups: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user groups:', error);
    return [];
  }
};

export const groupShareFlags = new Map<string, boolean>();

export const checkGroupSharePermission = async (
  notebookId: string
): Promise<void> => {
  const groups = await getUserGroup(notebookId);
  groupShareFlags.set(notebookId, groups.length > 0);
};

export const getConnectedTeammates = async (
  notebookId: string
): Promise<string[]> => {
  if (!PERSISTENT_USER_ID) {
    console.log(`${APP_ID}: No user id`);
    return [];
  }
  const url = `${WEBSOCKET_API_URL}/groups/users/${PERSISTENT_USER_ID}/teammates/connected?notebookId=${encodeURIComponent(notebookId)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch connected teammates: ${response.status}`);
      return [];
    }
    const data = await response.json();

    return data;
  } catch (error) {
    console.error('Error fetching connected teammates:', error);
    return [];
  }
};
