import { NotebookPanel } from '@jupyterlab/notebook';

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
  message: string
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
      showUpdateNotification(notebookPanel, contentJson, jsonParsed.action);
    } else if (jsonParsed.action === UPDATE_NOTEBOOK_ACTION) {
      const contentJson = jsonParsed.content;
      showUpdateNotification(notebookPanel, contentJson, jsonParsed.action);
    }
  } catch (error) {
    console.error('Error parsing JSON from sync message:', error, message);
  }
};

function showUpdateNotification(
  notebookPanel: NotebookPanel,
  newContent: any,
  action: typeof UPDATE_CELL_ACTION | typeof UPDATE_NOTEBOOK_ACTION
) {
  // Future: add a diff view of the changes
  let notificationTitle = 'Notebook Updated';
  const notificationNote =
    '(Note: your code will be kept in its original cell.)';
  let notificationBody =
    'The teacher updated this notebook. Would you like to get the latest version?';
  if (action === UPDATE_CELL_ACTION) {
    notificationTitle = 'Cell Updated';
    notificationBody =
      'The teacher updated a cell in this notebook. Would you like to get the latest version?';
  } else if (action === UPDATE_NOTEBOOK_ACTION) {
    notificationTitle = 'Notebook Updated';
    notificationBody =
      'The teacher updated the entire notebook. Would you like to get the latest version?';
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
  const content =
    typeof newContent === 'string' ? JSON.parse(newContent) : newContent;
  const cells = content.cells;

  // const currentPanel = notebookTracker.currentWidget;
  const notebook = notebookPanel?.content;

  cells.forEach((cell: any) => {
    try {
      const currentCell = notebook?.widgets.find(
        (widget: any) => widget.model.id === cell.id
      );
      if (!currentCell) {
        notebook?.model?.sharedModel.addCell(cell);
      } else {
        try {
          const oldSource = currentCell.model.sharedModel.source;
          const updatedSource =
            oldSource +
            `\n\n# UPDATED CONTENT AT ${new Date().toLocaleString()}\n\n` +
            cell.source;

          currentCell.model.sharedModel.setSource(updatedSource);
        } catch (innerError) {
          console.error(
            `Inner error while updating cell with id ${cell.id}:`,
            innerError
          );
        }
      }
    } catch (error) {
      console.error(`Error updating cell with id ${cell.id}:`, error);
    }
  });
}
