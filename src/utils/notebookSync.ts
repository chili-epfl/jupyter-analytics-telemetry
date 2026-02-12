import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';

import { refreshIcon } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';
import { PERSISTENT_USER_ID } from '..';
import { postPendingUpdateInteraction } from '../api';
import { WEBSOCKET_API_URL } from '../dataCollectionPlugin';
import { CompatibilityManager } from './compatibility';
import { APP_ID, Selectors } from './constants';
import { getOrigCellMapping } from './utils';

// Sync action type constants
const UPDATE_CELL_ACTION = 'update_cell';
const UPDATE_NOTEBOOK_ACTION = 'update_notebook';

// Type of the expected message payload
interface ISyncMessagePayload {
  action: typeof UPDATE_CELL_ACTION | typeof UPDATE_NOTEBOOK_ACTION;
  content: any;
}
// Helper Function to Log Interactions
const logPendingUpdateInteraction = (
  panel: NotebookPanel,
  action:
    | 'UPDATE_NOW'
    | 'UPDATE_LATER'
    | 'UPDATE_ALL'
    | 'DELETE_ALL'
    | 'APPLY_SINGLE'
    | 'REMOVE_SINGLE',
  cellId?: string,
  sender?: string,
  senderType?: 'teacher' | 'teammate',
  updateId?: string
) => {
  if (!PERSISTENT_USER_ID) {
    console.warn(
      `${APP_ID}: Cannot log pending update interaction - no user ID`
    );
    return;
  }

  const notebookId = CompatibilityManager.getMetadataComp(
    panel.context.model,
    Selectors.notebookId
  );

  if (!notebookId) {
    console.warn(
      `${APP_ID}: Cannot log pending update interaction - no notebook ID`
    );
    return;
  }

  postPendingUpdateInteraction({
    notebook_id: notebookId,
    cell_id: cellId,
    update_id: updateId,
    action: action,
    sender: sender,
    sender_type: senderType,
    time: new Date().toISOString()
  });
};

// Function to handle the 'chat' message and trigger updates: Step 1
export const handleSyncMessage = (
  notebookPanel: NotebookPanel,
  message: string,
  sender: string,
  senderType: 'teacher' | 'teammate'
) => {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) {
    console.error('No JSON found in payload:', message);
    return;
  }

  const jsonStr = message.slice(jsonStart);
  try {
    const jsonParsed: ISyncMessagePayload & { update_id?: string } =
      JSON.parse(jsonStr);
    const updateId = jsonParsed.update_id;

    // Extract cell_id more thoroughly
    let cellId: string | undefined;

    // Try multiple ways to extract cell_id
    if (jsonParsed.content) {
      if (jsonParsed.content.id) {
        cellId = jsonParsed.content.id;
      } else if (jsonParsed.content.cell_id) {
        cellId = jsonParsed.content.cell_id;
      } else if (
        jsonParsed.content.cells &&
        Array.isArray(jsonParsed.content.cells) &&
        jsonParsed.content.cells.length > 0
      ) {
        cellId =
          jsonParsed.content.cells[0].id || jsonParsed.content.cells[0].cell_id;
      }
    }

    if (jsonParsed.action === UPDATE_CELL_ACTION) {
      const contentJson = { cells: [jsonParsed.content] };
      showUpdateNotification(
        notebookPanel,
        contentJson,
        jsonParsed.action,
        sender,
        senderType,
        updateId,
        cellId
      );
    } else if (jsonParsed.action === UPDATE_NOTEBOOK_ACTION) {
      const contentJson = jsonParsed.content;
      showUpdateNotification(
        notebookPanel,
        contentJson,
        jsonParsed.action,
        sender,
        senderType,
        updateId,
        cellId
      );
    }
  } catch (error) {
    console.error('Error parsing JSON from sync message:', error, message);
  }
};

// renderPendingUpdatesWidget: expose a renderer function that other modules can bind to the real sidebar
export let renderPendingUpdatesWidget: (
  panel: NotebookPanel | null
) => void = () => {};

// add this binder so other modules can bind the real sidebar instance (Used to refresh to get the latest updates)
export const bindRenderPendingUpdatesWidget = (
  sidebar: PendingUpdatesSidebar
) => {
  renderPendingUpdatesWidget = (panel: NotebookPanel | null) =>
    sidebar.setCurrentPanel(panel);
};

// binder that allows the sidebar to request the current NotebookPanel
export let requestCurrentPanel: (() => NotebookPanel | null) | null = null;
export const bindRequestCurrentPanel = (fn: () => NotebookPanel | null) => {
  requestCurrentPanel = fn;
};

/**
 * HELPER METHODS FOR PENDING UPDATES
 */
type IPendingUpdate = {
  id: string; // cell id
  message: any; // content of the update
  timeReceived: string; // Time Stamp
  sender: string; // 'teacher' or hashed teammate id
  senderType: 'teacher' | 'teammate'; // Type of sender for filtering
  updateId?: string; // The update_id from the push notification
  cellId?: string; // The actual cell_id from the update content
};

/**
 * getPendingUpdates: Retrieves the Pending Updates from the Metadata
 */
const getPendingUpdates = (panel: NotebookPanel): IPendingUpdate[] => {
  if (!panel || panel.isDisposed) {
    return [];
  }
  const list =
    CompatibilityManager.getMetadataComp(
      panel.context.model,
      Selectors.pendingUpdates
    ) || [];
  return Array.isArray(list) ? list : [];
};

/**
 * setPendingUpdates: Set the Pending Updates in the Metadata
 */
const setPendingUpdates = (panel: NotebookPanel, updates: IPendingUpdate[]) => {
  CompatibilityManager.setMetadataComp(
    panel.context.model,
    Selectors.pendingUpdates,
    updates
  );
};

/**
 * removePendingUpdate: Remove the Pending Update once applied or canceled
 */
export const removePendingUpdate = (
  panel: NotebookPanel,
  cellId: string,
  logInteraction: boolean = false,
  sender?: string,
  senderType?: 'teacher' | 'teammate',
  updateId?: string
) => {
  if (!panel || panel.isDisposed) {
    return;
  }

  const updates = getPendingUpdates(panel);
  const updateToRemove = updates.find(u => u.id === cellId);

  // Log REMOVE_SINGLE interaction if requested
  if (logInteraction && updateToRemove) {
    logPendingUpdateInteraction(
      panel,
      'REMOVE_SINGLE',
      cellId,
      sender || updateToRemove.sender,
      senderType || updateToRemove.senderType,
      updateId || updateToRemove.updateId
    );
  }

  const filteredUpdates = updates.filter(u => u.id !== cellId);
  setPendingUpdates(panel, filteredUpdates);
  renderPendingUpdatesWidget(panel);
};

// applyPendingUpdate: Applying the Updates to the actual notebook
export const applyPendingUpdate = async (
  panel: NotebookPanel,
  pending: IPendingUpdate,
  skipLogging: boolean = false // Add parameter to skip logging when called from Apply All
) => {
  try {
    // Extract update_id and cellId from the pending update
    let updateId: string | undefined = pending.updateId;
    let cellId: string | undefined = pending.cellId;

    // If not in pending object, try to extract from message
    if (!updateId || !cellId) {
      try {
        const parsed =
          typeof pending.message === 'string'
            ? JSON.parse(pending.message)
            : pending.message;
        updateId = updateId || parsed.update_id || undefined;

        // Extract cell_id if not already set
        if (!cellId) {
          if (parsed.id) {
            cellId = parsed.id;
          } else if (parsed.cell_id) {
            cellId = parsed.cell_id;
          } else if (parsed.cells && parsed.cells.length > 0) {
            cellId = parsed.cells[0].id || parsed.cells[0].cell_id;
          }
        }
      } catch (e) {
        console.warn(
          'Could not extract update_id or cell_id from pending update',
          e
        );
      }
    }

    // Apply the update - pass skipLogging to prevent double logging
    await updateNotebookContent(
      panel,
      pending.message,
      updateId,
      cellId,
      pending.sender,
      pending.senderType,
      skipLogging
    );

    // remove it afterwards
    removePendingUpdate(panel, pending.id);
  } catch (error) {
    console.error('Failed to apply pending update:', error);
  }
};

/**
 * getUpdatedCells: Retrieves the list of cell IDs that have been updated before
 */
const getUpdatedCells = (panel: NotebookPanel): string[] => {
  if (!panel || panel.isDisposed) {
    return [];
  }
  const list =
    CompatibilityManager.getMetadataComp(
      panel.context.model,
      Selectors.updatedCells
    ) || [];
  return Array.isArray(list) ? list : [];
};

/**
 * markCellAsUpdated: Marks a cell as having been updated
 */
const markCellAsUpdated = (panel: NotebookPanel, cellId: string) => {
  const updatedCells = getUpdatedCells(panel);
  if (!updatedCells.includes(cellId)) {
    updatedCells.push(cellId);
    CompatibilityManager.setMetadataComp(
      panel.context.model,
      Selectors.updatedCells,
      updatedCells
    );
  }
};

// SETTING THE PENDING UPDATE SIDEBAR
/**
 * - Listen to the change in notebook metadata (or model change) and signals a re-render when pending updates changes.
 */
export class PendingUpdatesSidebar extends Widget {
  private _currentPanel: NotebookPanel | null = null; // notebook for which the sidebar is tracking
  private _metadataConnected = false;
  private _sortKey: 'time' | 'cell' = 'time';
  private _cellsConnected = false;
  private _connectedTeammates: string[] = []; // Track connected teammates
  private _filterMode: 'all' | 'teacher' | 'teammates' | 'selected' = 'all'; // Filter mode
  private _selectedTeammateFilters: Set<string> = new Set(); // Selected teammates for filtering
  private _boundMetadataChanged = () => {
    // re-render when metadata changes
    this.render();
  };

  // Listen for deletions and remove the "cell below" id from updatedCells metadata (CAN USE THE CELL MAPPING)
  private _boundCellsChanged = (list: any, change: any) => {
    try {
      if (!this._currentPanel || this._currentPanel.isDisposed) {
        return;
      }
      // handle remove events from IObservableList
      if (change && change.type === 'remove') {
        const oldIndex =
          typeof change.oldIndex === 'number' ? change.oldIndex : null;
        // run after microtask so model & widgets reflect removal
        setTimeout(() => {
          try {
            if (oldIndex === null) {
              return;
            }
            const panel = this._currentPanel as NotebookPanel;
            // get the original-id ordering for current notebook
            const origMapping = getOrigCellMapping(panel);
            if (!origMapping || origMapping.length === 0) {
              return;
            }
            // the cell that is now at position oldIndex was previously below the deleted cell(s)
            const belowId = origMapping[oldIndex];
            if (!belowId) {
              return;
            }
            const updated = getUpdatedCells(panel);
            if (Array.isArray(updated) && updated.includes(belowId)) {
              const newUpdated = updated.filter(id => id !== belowId);
              // write back to metadata using CompatibilityManager (same method used elsewhere)
              CompatibilityManager.setMetadataComp(
                panel.context.model,
                Selectors.updatedCells,
                newUpdated
              );
              // refresh sidebar UI
              this.render();
            }
          } catch (err) {
            console.warn(
              'Error handling cell removal for updatedCells cleanup',
              err
            );
          }
        }, 0);
      }
    } catch (err) {
      console.warn('cells.changed handler threw', err);
    }
  };

  constructor() {
    super();
    this.id = 'unianalytics-pending-updates-sidebar';
    this.title.label = 'Pending updates';
    this.title.closable = true;
    this.addClass('unianalytics-pending-updates-sidebar');

    // header with refresh button
    const header = document.createElement('div');
    header.className = 'pending-updates-header';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-refresh';
    refreshBtn.innerHTML = refreshIcon.svgstr;
    refreshBtn.title = 'Refresh pending updates and re-check notebook metadata';
    refreshBtn.setAttribute('aria-label', 'Refresh pending updates');
    refreshBtn.onclick = () => {
      // trigger re-attach and re-render
      this.refresh();
    };

    // Sort Controls (Time and Cell)
    const sortContainer = document.createElement('div');
    sortContainer.className = 'pending-updates-sort';
    const sortLabel = document.createElement('span');
    sortLabel.className = 'sort-label';
    sortLabel.textContent = 'Sort by';

    const sortSelect = document.createElement('select');
    sortSelect.className = 'pending-updates-sort-select';
    const optTime = document.createElement('option');
    optTime.value = 'time';
    optTime.text = 'Time';
    const optCell = document.createElement('option');
    optCell.value = 'cell';
    optCell.text = 'Cell';
    sortSelect.appendChild(optTime);
    sortSelect.appendChild(optCell);
    // initialize selection from current state
    sortSelect.value = this._sortKey;
    sortSelect.addEventListener('change', () => {
      this._sortKey = sortSelect.value as 'time' | 'cell';
      this.render();
    });

    sortContainer.appendChild(sortLabel);
    sortContainer.appendChild(sortSelect);

    // Right-Side Actions: Apply All / Delete All
    const rightActions = document.createElement('div');
    rightActions.className = 'pending-updates-header-actions';

    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'btn btn-apply-all';
    applyAllBtn.textContent = 'Apply All';
    applyAllBtn.title = 'Apply all filtered pending updates';
    applyAllBtn.onclick = async () => {
      if (!this._currentPanel || this._currentPanel.isDisposed) {
        return;
      }
      const updates = this.getFilteredUpdates();
      if (!updates || updates.length === 0) {
        return;
      }

      // Log ONLY the UPDATE_ALL action with the first update's update_id
      if (updates.length > 0 && updates[0].updateId) {
        logPendingUpdateInteraction(
          this._currentPanel,
          'UPDATE_ALL',
          undefined, // no specific cell_id for UPDATE_ALL
          updates[0].sender,
          updates[0].senderType,
          updates[0].updateId
        );
      }

      // Apply each update individually WITHOUT logging APPLY_SINGLE (skipLogging = true)
      for (const u of updates) {
        await applyPendingUpdate(this._currentPanel, u, true); // Pass true to skip logging
      }
      this.render();
    };

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.className = 'btn btn-delete-all';
    deleteAllBtn.textContent = 'Delete All';
    deleteAllBtn.title = 'Delete all filtered pending updates';
    deleteAllBtn.onclick = () => {
      if (!this._currentPanel || this._currentPanel.isDisposed) {
        return;
      }

      const filteredUpdates = this.getFilteredUpdates();
      if (!filteredUpdates || filteredUpdates.length === 0) {
        return;
      }

      // Log ONLY the DELETE_ALL action with the first update's update_id
      if (filteredUpdates.length > 0 && filteredUpdates[0].updateId) {
        logPendingUpdateInteraction(
          this._currentPanel,
          'DELETE_ALL',
          undefined, // no specific cell_id for DELETE_ALL
          filteredUpdates[0].sender,
          filteredUpdates[0].senderType,
          filteredUpdates[0].updateId
        );
      }

      // Remove filtered updates WITHOUT logging individual REMOVE_SINGLE actions
      const allUpdates = getPendingUpdates(this._currentPanel);
      const filteredIds = new Set(filteredUpdates.map(u => u.id));
      const remainingUpdates = allUpdates.filter(u => !filteredIds.has(u.id));
      setPendingUpdates(this._currentPanel, remainingUpdates);
      renderPendingUpdatesWidget(this._currentPanel);
      this.render();
    };

    header.appendChild(refreshBtn);
    header.appendChild(sortContainer);
    rightActions.appendChild(applyAllBtn);
    rightActions.appendChild(deleteAllBtn);
    header.appendChild(rightActions);
    this.node.appendChild(header);

    // Filter section
    const filterSection = document.createElement('div');
    filterSection.className = 'pending-updates-filter-section';

    const filterHeader = document.createElement('div');
    filterHeader.className = 'pending-updates-filter-header';

    const filterTitle = document.createElement('span');
    filterTitle.className = 'pending-updates-filter-title';
    filterTitle.textContent = 'Filter by sender';

    const filterSelect = document.createElement('select');
    filterSelect.className = 'pending-updates-filter-select';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.text = 'All Updates';
    const optTeacher = document.createElement('option');
    optTeacher.value = 'teacher';
    optTeacher.text = 'Teacher Only';
    const optTeammates = document.createElement('option');
    optTeammates.value = 'teammates';
    optTeammates.text = 'All Teammates';
    const optSelected = document.createElement('option');
    optSelected.value = 'selected';
    optSelected.text = 'Selected Teammates';

    filterSelect.appendChild(optAll);
    filterSelect.appendChild(optTeacher);
    filterSelect.appendChild(optTeammates);
    filterSelect.appendChild(optSelected);
    filterSelect.value = this._filterMode;

    filterSelect.addEventListener('change', () => {
      this._filterMode = filterSelect.value as
        | 'all'
        | 'teacher'
        | 'teammates'
        | 'selected';
      this.renderTeammateFilterList();
      this.render();
    });

    filterHeader.appendChild(filterTitle);
    filterHeader.appendChild(filterSelect);
    filterSection.appendChild(filterHeader);

    // Container for selected teammates checkboxes (shown when 'selected' filter is active)
    const teammateFilterList = document.createElement('div');
    teammateFilterList.className = 'teammate-filter-list';
    filterSection.appendChild(teammateFilterList);

    this.node.appendChild(filterSection);

    // Connected teammates section
    const teammatesSection = document.createElement('div');
    teammatesSection.className = 'connected-teammates-section';
    const teammatesHeader = document.createElement('div');
    teammatesHeader.className = 'connected-teammates-header';
    const teammatesTitle = document.createElement('span');
    teammatesTitle.className = 'connected-teammates-title';
    teammatesTitle.textContent = 'Connected Teammates';
    teammatesHeader.appendChild(teammatesTitle);
    const teammatesContainer = document.createElement('div');
    teammatesContainer.className = 'connected-teammates-container';
    teammatesSection.appendChild(teammatesHeader);
    teammatesSection.appendChild(teammatesContainer);
    this.node.appendChild(teammatesSection);

    // initial content container
    const container = document.createElement('div');
    container.className = 'pending-updates-container';
    this.node.appendChild(container);
  }

  // To Get the Updates when Starting for the First Time
  public refresh(): void {
    // if no panel is set, try to obtain one from the optional binder
    if (!this._currentPanel) {
      if (requestCurrentPanel) {
        try {
          const panel = requestCurrentPanel();
          // if binder returned a panel (possibly null), re-run setCurrentPanel to attach listeners/render
          this.setCurrentPanel(panel);
          return;
        } catch (e) {
          console.error('Failed to obtain current panel from binder', e);
          // fallback to render below
        }
      }
      // fallback: just render (clears message)
      this.render();
      return;
    }
    // Refresh teammates as well
    this.fetchConnectedTeammates();
    this.render();
  }

  // Fetch connected teammates for the current notebook
  private async fetchConnectedTeammates() {
    if (!this._currentPanel || this._currentPanel.isDisposed) {
      this._connectedTeammates = [];
      this.renderTeammates();
      return;
    }

    const notebookId = CompatibilityManager.getMetadataComp(
      this._currentPanel.context.model,
      Selectors.notebookId
    );

    if (!notebookId) {
      this._connectedTeammates = [];
      this.renderTeammates();
      return;
    }

    try {
      const teammates = await getConnectedTeammates(notebookId);
      this._connectedTeammates = teammates;
      this.renderTeammates();
    } catch (error) {
      console.error('Failed to fetch connected teammates:', error);
      this._connectedTeammates = [];
      this.renderTeammates();
    }
  }

  // Render the connected teammates section
  private renderTeammates() {
    const container = this.node.querySelector(
      '.connected-teammates-container'
    ) as HTMLElement;
    if (!container) {
      return;
    }
    container.innerHTML = '';

    if (!this._currentPanel || this._currentPanel.isDisposed) {
      container.textContent = 'No notebook selected';
      return;
    }

    if (this._connectedTeammates.length === 0) {
      container.textContent = 'No teammates connected';
      return;
    }

    for (const teammate of this._connectedTeammates) {
      const teammateRow = document.createElement('div');
      teammateRow.className = 'connected-teammate-row';

      // Display truncated hash for privacy
      const displayId =
        teammate.length > 12 ? `${teammate.substring(0, 12)}...` : teammate;

      // Online indicator dot
      const statusDot = document.createElement('span');
      statusDot.className = 'teammate-status-dot online';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'teammate-name';
      nameSpan.textContent = displayId;
      nameSpan.title = teammate; // Show full ID on hover

      teammateRow.appendChild(statusDot);
      teammateRow.appendChild(nameSpan);
      container.appendChild(teammateRow);
    }
  }

  // Public method to trigger teammates refresh (called by WebsocketManager)
  public refreshTeammates(): void {
    this.fetchConnectedTeammates();
  }

  // Get unique senders from pending updates
  private getUniqueSenders(): { id: string; type: 'teacher' | 'teammate' }[] {
    if (!this._currentPanel || this._currentPanel.isDisposed) {
      return [];
    }
    const updates = getPendingUpdates(this._currentPanel);
    const senderMap = new Map<string, 'teacher' | 'teammate'>();

    for (const u of updates) {
      if (u.sender && u.senderType) {
        senderMap.set(u.sender, u.senderType);
      }
    }

    return Array.from(senderMap.entries()).map(([id, type]) => ({ id, type }));
  }

  // Render the teammate filter list (checkboxes for selected mode)
  private renderTeammateFilterList() {
    const container = this.node.querySelector(
      '.teammate-filter-list'
    ) as HTMLElement;
    if (!container) {
      return;
    }
    container.innerHTML = '';

    if (this._filterMode !== 'selected') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    const senders = this.getUniqueSenders();
    const teammates = senders.filter(s => s.type === 'teammate');

    if (teammates.length === 0) {
      container.textContent = 'No teammate updates available';
      return;
    }

    for (const teammate of teammates) {
      const checkboxRow = document.createElement('div');
      checkboxRow.className = 'teammate-filter-checkbox-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `filter-teammate-${teammate.id}`;
      checkbox.checked = this._selectedTeammateFilters.has(teammate.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this._selectedTeammateFilters.add(teammate.id);
        } else {
          this._selectedTeammateFilters.delete(teammate.id);
        }
        this.render();
      });

      const label = document.createElement('label');
      label.htmlFor = `filter-teammate-${teammate.id}`;
      const displayId =
        teammate.id.length > 12
          ? `${teammate.id.substring(0, 12)}...`
          : teammate.id;
      label.textContent = displayId;
      label.title = teammate.id;

      checkboxRow.appendChild(checkbox);
      checkboxRow.appendChild(label);
      container.appendChild(checkboxRow);
    }
  }

  // Get filtered updates based on current filter mode
  private getFilteredUpdates(): IPendingUpdate[] {
    if (!this._currentPanel || this._currentPanel.isDisposed) {
      return [];
    }

    let updates = getPendingUpdates(this._currentPanel);

    switch (this._filterMode) {
      case 'teacher':
        updates = updates.filter(u => u.senderType === 'teacher');
        break;
      case 'teammates':
        updates = updates.filter(u => u.senderType === 'teammate');
        break;
      case 'selected':
        updates = updates.filter(
          u =>
            u.senderType === 'teammate' &&
            this._selectedTeammateFilters.has(u.sender)
        );
        break;
      case 'all':
      default:
        // No filtering
        break;
    }

    return updates;
  }

  // Disconnects the Previous panel signal's and sets the current panel as the new panel.
  setCurrentPanel(panel: NotebookPanel | null) {
    // disconnect metadata listener from previous panel (if any)
    if (this._currentPanel && !this._currentPanel.isDisposed) {
      try {
        const prevModelAny: any = this._currentPanel.context.model;
        if (
          prevModelAny &&
          prevModelAny.metadata &&
          prevModelAny.metadata.changed &&
          this._metadataConnected
        ) {
          prevModelAny.metadata.changed.disconnect(
            this._boundMetadataChanged,
            this
          );
          this._metadataConnected = false;
        }

        // disconnect cells.changed if connected
        try {
          const prevContentModelAny: any =
            this._currentPanel.content &&
            (this._currentPanel.content as any).model;
          if (
            prevContentModelAny &&
            prevContentModelAny.cells &&
            prevContentModelAny.cells.changed &&
            this._cellsConnected
          ) {
            prevContentModelAny.cells.changed.disconnect(
              this._boundCellsChanged,
              this
            );
            this._cellsConnected = false;
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore disconnect errors
      }
    }

    this._currentPanel = panel;
    this._connectedTeammates = []; // Reset teammates when panel changes

    if (!panel) {
      // no panel -> clear / render
      this.render();
      this.renderTeammates();
      return;
    }

    // Wait for the notebook context to be ready (metadata available), then render and attach metadata listener
    void panel.context.ready.then(() => {
      this.render();
      this.fetchConnectedTeammates(); // Fetch teammates when panel is ready
      try {
        const modelAny: any = panel.context.model;
        // connect to metadata.changed where available
        if (modelAny && modelAny.metadata && modelAny.metadata.changed) {
          modelAny.metadata.changed.connect(this._boundMetadataChanged, this);
          this._metadataConnected = true;
        } else if (modelAny && modelAny.changed) {
          // fallback to model-level change signal
          console.log('Falling back to model level change');
          modelAny.changed.connect(this._boundMetadataChanged, this);
          this._metadataConnected = true;
        }

        // connect to cells.changed on the notebook content model to detect deletions
        try {
          const contentModelAny: any =
            panel.content && (panel.content as any).model;
          if (
            contentModelAny &&
            contentModelAny.cells &&
            contentModelAny.cells.changed
          ) {
            contentModelAny.cells.changed.connect(
              this._boundCellsChanged,
              this
            );
            this._cellsConnected = true;
          }
        } catch (e) {
          // ignore if cells.changed not available
        }
      } catch (e) {
        // ignore if signals are not present
      }
    });
  }

  // Render the Sidebar of PendingUpdates
  private async render() {
    const container = this.node.querySelector(
      '.pending-updates-container'
    ) as HTMLElement;
    if (!container) {
      return;
    }
    container.innerHTML = '';

    if (!this._currentPanel || this._currentPanel.isDisposed) {
      container.textContent = 'No notebook selected';
      return;
    }

    // Update teammate filter list when rendering
    this.renderTeammateFilterList();

    // get and sort updates according to the current sort key, then filter
    let updates = this.getFilteredUpdates();
    if (updates && updates.length > 0) {
      if (this._sortKey === 'time') {
        updates = updates.slice().sort((a, b) => {
          return (
            new Date(b.timeReceived).getTime() -
            new Date(a.timeReceived).getTime()
          );
        });
      } else if (this._sortKey === 'cell') {
        const origMapping = getOrigCellMapping(
          this._currentPanel as NotebookPanel
        );
        updates = updates.slice().sort((a, b) => {
          // Make it more easy to read and understand
          const aPos = origMapping ? origMapping.lastIndexOf(a.id) : -1;
          const bPos = origMapping ? origMapping.lastIndexOf(b.id) : -1;
          const ai = aPos === -1 ? Number.POSITIVE_INFINITY : aPos;
          const bi = bPos === -1 ? Number.POSITIVE_INFINITY : bPos;
          return ai - bi;
        });
      }
    }

    if (!updates || updates.length === 0) {
      container.textContent =
        this._filterMode === 'all'
          ? 'No pending updates'
          : 'No updates matching the current filter';
      return;
    }

    // helper to extract code text from a stored message
    const extractCodeText = (message: any): string => {
      try {
        const parsed =
          typeof message === 'string' ? JSON.parse(message) : message;
        // support payloads like { cells: [...] } or direct cell objects
        if (parsed && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
          return (
            parsed.cells[0].source ??
            parsed.cells[0].cell_content ??
            JSON.stringify(parsed.cells[0], null, 2)
          );
        }
        // final fallback: pretty JSON
        return typeof message === 'string'
          ? message
          : JSON.stringify(message, null, 2);
      } catch (e) {
        console.log('Cannot read the message');
        return typeof message === 'string' ? message : String(message);
      }
    };

    for (const u of updates) {
      // root row
      const row = document.createElement('div');
      row.className = 'pending-update-row';

      // header/top row
      const topRow = document.createElement('div');
      topRow.className = 'pending-update-top';

      const label = document.createElement('div');
      label.className = 'pending-update-label';

      // Uses the original-id ordering returned by getOrigCellMapping
      const origMapping = getOrigCellMapping(
        this._currentPanel as NotebookPanel
      );
      let cellLabel = String(u.id ?? '');
      if (origMapping && u.id) {
        const pos = origMapping.indexOf(u.id);
        if (pos !== -1) {
          cellLabel = `Cell ${pos + 1}`;
        } else {
          cellLabel = 'Cell: unknown';
        }
      } else if (!u.id) {
        cellLabel = 'Cell: unknown';
      }

      const timeStr = new Date(u.timeReceived).toLocaleString();
      label.textContent = `${cellLabel} • ${timeStr}`;

      // Format sender display
      let senderDisplay = '';
      if (u.senderType === 'teacher') {
        senderDisplay = 'Teacher';
      } else if (u.sender) {
        senderDisplay =
          u.sender.length > 8 ? `${u.sender.substring(0, 8)}...` : u.sender;
      } else {
        senderDisplay = 'Unknown';
      }

      // Sender badge
      const senderBadge = document.createElement('span');
      senderBadge.className = `pending-update-sender-badge ${u.senderType === 'teacher' ? 'sender-teacher' : 'sender-teammate'}`;
      senderBadge.textContent = senderDisplay;
      if (u.sender && u.senderType === 'teammate') {
        senderBadge.title = u.sender; // Show full ID on hover
      }

      const btnGroup = document.createElement('div');
      btnGroup.className = 'pending-update-actions';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-apply';
      applyBtn.textContent = 'Apply';
      applyBtn.onclick = async () => {
        if (this._currentPanel) {
          await applyPendingUpdate(this._currentPanel, u);
          this.render();
        }
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-delete';
      removeBtn.textContent = 'Delete';
      removeBtn.onclick = () => {
        if (this._currentPanel) {
          // Pass true to log the interaction, and pass the sender, senderType, and updateId
          removePendingUpdate(
            this._currentPanel,
            u.id,
            true,
            u.sender,
            u.senderType,
            u.updateId
          );
          this.render();
        }
      };

      btnGroup.appendChild(applyBtn);
      btnGroup.appendChild(removeBtn);

      topRow.appendChild(label);
      topRow.appendChild(senderBadge);
      topRow.appendChild(btnGroup);

      // code preview block
      const codeContainer = document.createElement('div');
      codeContainer.className = 'pending-update-code-container';

      const codeText = extractCodeText(u.message);
      const lines = codeText.split(/\r?\n/);
      const previewLines = lines.slice(0, 5).join('\n');

      const pre = document.createElement('pre');
      pre.className = 'pending-update-code';
      pre.textContent = previewLines;

      const controls = document.createElement('div');
      controls.className = 'pending-update-code-controls';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-toggle';
      toggleBtn.textContent = lines.length > 5 ? 'Show more' : 'Show full';

      let expanded = false;
      toggleBtn.onclick = () => {
        expanded = !expanded;
        if (expanded) {
          pre.textContent = codeText;
          pre.classList.add('expanded');
          toggleBtn.textContent = 'Show less';
        } else {
          pre.textContent = previewLines;
          pre.classList.remove('expanded');
          toggleBtn.textContent = lines.length > 5 ? 'Show more' : 'Show full';
        }
      };

      controls.appendChild(toggleBtn);

      codeContainer.appendChild(pre);
      // only attach controls when there is more than 5 lines
      if (lines.length > 5) {
        codeContainer.appendChild(controls);
      }

      // assemble row
      row.appendChild(topRow);
      row.appendChild(codeContainer);

      container.appendChild(row);
    }
  }
}

export const createPendingUpdatesSidebar = (): PendingUpdatesSidebar =>
  new PendingUpdatesSidebar();

// Step 2
function showUpdateNotification(
  notebookPanel: NotebookPanel,
  newContent: any,
  action: typeof UPDATE_CELL_ACTION | typeof UPDATE_NOTEBOOK_ACTION,
  sender: string,
  senderType: 'teacher' | 'teammate',
  updateId?: string,
  explicitCellId?: string
) {
  // Future: add a diff view of the changes
  let notificationTitle = 'Notebook Updated';
  const notificationNote = '(Note: your code will be moved to one cell above.)';

  // Display "teacher" or "teammate" based on the sender type
  const displaySender = senderType === 'teacher' ? 'teacher' : 'teammate';

  // Use explicit cell ID if provided, otherwise try to extract
  let cellId: string | undefined = explicitCellId;

  if (!cellId) {
    try {
      const parsed =
        typeof newContent === 'string' ? JSON.parse(newContent) : newContent;

      // Try different ways to get cell_id
      if (parsed.content) {
        cellId = parsed.content.id || parsed.content.cell_id;
        if (
          !cellId &&
          parsed.content.cells &&
          parsed.content.cells.length > 0
        ) {
          cellId =
            parsed.content.cells[0].id || parsed.content.cells[0].cell_id;
        }
      } else if (parsed.cells && parsed.cells.length > 0) {
        cellId = parsed.cells[0].id || parsed.cells[0].cell_id;
      }
    } catch (e) {
      console.warn('Failed to extract cellId from newContent', e);
    }
  }

  // Determine the final update ID to use
  const finalUpdateId =
    updateId || cellId || Math.random().toString(36).substring(2, 15);

  let notificationBody = `Your ${displaySender} updated this notebook. Would you like to get the latest version? You can also update it later from the Pending Updates sidebar.`;
  if (action === UPDATE_CELL_ACTION) {
    notificationTitle = 'Cell Updated';
    notificationBody = `Your ${displaySender} updated a cell in this notebook. Would you like to get the latest version? You can also update it later from the Pending Updates sidebar.`;
  } else if (action === UPDATE_NOTEBOOK_ACTION) {
    notificationTitle = 'Notebook Updated';
    notificationBody = `Your ${displaySender} updated the entire notebook. Would you like to get the latest version? You can also update it later from the Pending Updates sidebar.`;
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
          <button id="later-${id}-button" class="notification-later-button">Update Later</button> 
        </div>
      </div>
    `;
  document.body.insertAdjacentHTML('beforeend', notificationHTML);
  const notificationDiv = document.getElementById(`update-notification-${id}`);
  const updateButton = document.getElementById(`update-${id}-button`);
  const laterButton = document.getElementById(`later-${id}-button`);
  if (updateButton) {
    updateButton.addEventListener('click', async () => {
      // Log the interaction
      logPendingUpdateInteraction(
        notebookPanel,
        'UPDATE_NOW',
        cellId,
        sender,
        senderType,
        finalUpdateId
      );

      await updateNotebookContent(
        notebookPanel,
        newContent,
        finalUpdateId,
        cellId,
        sender,
        senderType
      );

      // Remove any pending updates that correspond to the applied content
      try {
        const parsed =
          typeof newContent === 'string' ? JSON.parse(newContent) : newContent;
        const cellIds: string[] = [];

        // Check if update_cell action: content has id field
        if (Array.isArray(parsed.cells) && parsed.cells.length > 0) {
          for (const c of parsed.cells) {
            const id = c.id || c.cell_id;
            if (id) {
              cellIds.push(id);
            }
          }
        } else if (parsed.id) {
          cellIds.push(parsed.id);
        }

        if (cellIds.length > 0 && notebookPanel && !notebookPanel.isDisposed) {
          for (const id of cellIds) {
            try {
              removePendingUpdate(notebookPanel, id);
            } catch (e) {
              console.warn('Failed to remove pending update for id', id, e);
            }
          }
          // ensure sidebar re-renders
          renderPendingUpdatesWidget(notebookPanel);
        }
      } catch (err) {
        console.warn(
          'Could not parse applied content to cleanup pending updates',
          err
        );
      }

      if (notificationDiv) {
        notificationDiv.remove();
      }
    });
  }
  if (laterButton) {
    laterButton.addEventListener('click', () => {
      // Add the update to the pending updates list
      const updates = getPendingUpdates(notebookPanel);

      const newUpdate: IPendingUpdate = {
        id: cellId || finalUpdateId,
        message: newContent,
        timeReceived: new Date().toISOString(),
        sender: sender,
        senderType: senderType,
        updateId: finalUpdateId, // Store the update_id
        cellId: cellId // Store the actual cell_id from the update content
      };

      // Filter out existing update with same ID if present, then add new one
      const filteredUpdates = updates.filter(u => u.id !== newUpdate.id);
      filteredUpdates.push(newUpdate);

      setPendingUpdates(notebookPanel, filteredUpdates);
      renderPendingUpdatesWidget(notebookPanel);

      // Log the interaction
      logPendingUpdateInteraction(
        notebookPanel,
        'UPDATE_LATER',
        cellId,
        sender,
        senderType,
        finalUpdateId
      );

      if (notificationDiv) {
        notificationDiv.remove();
      }
    });
  }
}

async function updateNotebookContent(
  notebookPanel: NotebookPanel,
  newContent: any,
  updateId?: string,
  cellId?: string,
  sender?: string,
  senderType?: 'teacher' | 'teammate',
  skipLogging: boolean = false
) {
  try {
    const cellUpdates =
      typeof newContent === 'string'
        ? JSON.parse(newContent).cells
        : newContent.cells;

    const origCellMapping = getOrigCellMapping(notebookPanel);
    const notebook = notebookPanel.content;
    const timeReceived = new Date().toLocaleString();
    const updatedCells = getUpdatedCells(notebookPanel);

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

      const isFirstUpdate = !updatedCells.includes(cellUpdate.id);

      if (isFirstUpdate) {
        // First time: copy existing cell above and replace original with update
        const existingCell = notebook.widgets[cellIndex];
        const existingSource = existingCell.model.sharedModel.getSource();

        // Insert a new cell above with the existing content
        notebook.activeCellIndex = cellIndex;
        NotebookActions.insertAbove(notebook);

        // Set the cell type if it's markdown
        if (cellType === 'markdown') {
          NotebookActions.changeCellType(notebook, cellType);
        }

        // Copy the existing content to the new cell above
        const newCellAbove = notebook.widgets[cellIndex];
        const yourCodePrefix =
          cellType === 'markdown' ? '# YOUR CODE\n\n' : '# YOUR CODE\n\n';
        newCellAbove.model.sharedModel.setSource(
          yourCodePrefix + existingSource
        );

        // Update the original cell (which is now at cellIndex + 1)
        const originalCell = notebook.widgets[cellIndex + 1];
        originalCell.model.sharedModel.setSource(cellUpdateSource);

        // Mark this cell as updated
        markCellAsUpdated(notebookPanel, cellUpdate.id);

        // Set active cell to the updated one
        notebook.activeCellIndex = cellIndex + 1;
      } else {
        // Subsequent updates: just replace the original cell content
        const existingCell = notebook.widgets[cellIndex];
        existingCell.model.sharedModel.setSource(cellUpdateSource);

        // Set active cell to the updated one
        notebook.activeCellIndex = cellIndex;
      }

      notebook.mode = 'command';
      notebook.scrollToItem(notebook.activeCellIndex, 'center');
    }

    // Log the APPLY_SINGLE interaction ONLY if not called from Apply All (skipLogging = false)
    if (!skipLogging && updateId && PERSISTENT_USER_ID) {
      const notebookId = CompatibilityManager.getMetadataComp(
        notebookPanel.context.model,
        Selectors.notebookId
      );

      if (notebookId) {
        const cellUpdatesArray =
          typeof newContent === 'string'
            ? JSON.parse(newContent).cells
            : newContent.cells;

        for (const cellUpdate of cellUpdatesArray) {
          const cellUpdateId = cellUpdate.id || cellUpdate.cell_id;

          // Log the interaction - use the cellId parameter if available, otherwise extract from content
          logPendingUpdateInteraction(
            notebookPanel,
            'APPLY_SINGLE',
            cellId || cellUpdateId,
            sender,
            senderType,
            updateId
          );
        }
      }
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
