import { JupyterFrontEnd, LabShell } from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { shareIcon } from '@jupyterlab/ui-components';
import { PanelManager } from './PanelManager';
import { CompatibilityManager } from './utils/compatibility';
import { CommandIDs, Selectors } from './utils/constants';
import {
  bindRenderPendingUpdatesWidget,
  bindRequestCurrentPanel,
  createPendingUpdatesSidebar,
  getConnectedTeammates,
  groupShareFlags,
  PendingUpdatesSidebar
} from './utils/notebookSync';
import { getOrigCellMapping } from './utils/utils';

let pendingSidebar: PendingUpdatesSidebar | null = null;

export const notebookSyncPlugin = (
  app: JupyterFrontEnd,
  panelManager: PanelManager
) => {
  // Create the pending updates sidebar widget (only if not already created)
  if (!pendingSidebar) {
    pendingSidebar = createPendingUpdatesSidebar();
    // Binds the instance of PendingUpdatesSidebar with this function.
    bindRenderPendingUpdatesWidget(pendingSidebar);
    // rank controls position among right widgets; pick a sensible rank
    app.shell.add(pendingSidebar, 'right', { rank: 600 });
  }

  bindRequestCurrentPanel(() => panelManager.panel);

  // Add share cell command
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

  // Listen for panel changes
  const labShell = app.shell as LabShell;
  if (labShell) {
    labShell.currentChanged.connect(() => {
      const widget = labShell.currentWidget;
      if (widget instanceof NotebookPanel) {
        pendingSidebar?.setCurrentPanel(widget);
      } else {
        pendingSidebar?.setCurrentPanel(null);
      }
    });
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
      update_id: crypto.randomUUID() // Generate unique update ID
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
    return;
  }

  for (const userId of await teammateList) {
    panelManager.websocketManager.sendMessageToTeammates(userId, message);
  }
};

// Export for external access if needed
export const getPendingSidebar = (): PendingUpdatesSidebar | null =>
  pendingSidebar;

// Refresh the pending sidebar teammates
export const refreshPendingSidebar = () => {
  if (pendingSidebar) {
    pendingSidebar.refreshTeammates();
  }
};
