import { Cell } from '@jupyterlab/cells';
import { NotebookPanel } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';
import { ITeammateLocation } from '../websocket/WebsocketManager';
import { CompatibilityManager } from './compatibility';
import { APP_ID, Selectors } from './constants';
import { getConnectedTeammates } from './notebookSync';
import { getOrigCellMapping } from './utils';

/**
 * Interface for a heading in the TOC
 */
interface IHeading {
  text: string;
  level: number;
  cellId: string;
  origCellId: string; // The original cell ID for matching with teammate locations
  cellIndex: number;
  type: 'header' | 'markdown' | 'code';
}

/**
 * TeammateLocationSidebar - A sidebar widget that shows a TOC-style view
 * with teammate locations indicated by colored dots
 */
export class TeammateLocationSidebar extends Widget {
  private _notebookPanel: NotebookPanel | null = null;
  private _teammateLocations: Map<string, ITeammateLocation> = new Map();
  private _connectedTeammates: string[] = [];
  private _headings: IHeading[] = [];
  private _container: HTMLDivElement;
  private _headerDiv: HTMLDivElement;
  private _contentDiv: HTMLDivElement;
  private _fetchTeammateLocationsCallback:
    | ((notebookId: string) => Promise<ITeammateLocation[]>)
    | null = null;

  constructor() {
    super();
    // Set unique ID for the widget - required by JupyterLab shell
    this.id = 'jupyterlab-unianalytics-teammate-location-sidebar';
    this.addClass('teammate-location-sidebar');
    this.title.label = 'Teammate Locations';
    this.title.closable = true;

    // Create container
    this._container = document.createElement('div');
    this._container.className = 'teammate-location-container';

    // Create header with refresh button
    this._headerDiv = document.createElement('div');
    this._headerDiv.className = 'teammate-location-header';
    this._headerDiv.innerHTML = `
            <div class="teammate-location-header-content">
                <h3>📍 Teammate Locations</h3>
                <span class="teammate-location-count">0 teammates online</span>
            </div>
            <button class="teammate-location-refresh-btn" title="Refresh">↻</button>
        `;

    // Add refresh button handler
    const refreshBtn = this._headerDiv.querySelector(
      '.teammate-location-refresh-btn'
    );
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refresh();
      });
    }

    // Create content area
    this._contentDiv = document.createElement('div');
    this._contentDiv.className = 'teammate-location-content';

    this._container.appendChild(this._headerDiv);
    this._container.appendChild(this._contentDiv);
    this.node.appendChild(this._container);

    this._render();
  }

  /**
   * Set callback for fetching teammate locations from the backend
   */
  public setFetchTeammateLocationsCallback(
    callback: (notebookId: string) => Promise<ITeammateLocation[]>
  ) {
    this._fetchTeammateLocationsCallback = callback;
  }

  /**
   * Set the active notebook panel
   */
  public setNotebookPanel(panel: NotebookPanel | null) {
    this._notebookPanel = panel;
    if (panel) {
      this._generateHeadings();
      // Wait for panel context to be ready before fetching
      void panel.context.ready.then(() => {
        this._fetchConnectedTeammates();
        this._fetchInitialLocations();
      });
    } else {
      this._headings = [];
      this._teammateLocations.clear();
      this._connectedTeammates = [];
      this._render();
    }
  }

  /**
   * Fetch connected teammates from Redis via API
   */
  private async _fetchConnectedTeammates() {
    if (!this._notebookPanel) {
      this._connectedTeammates = [];
      return;
    }

    const notebookId = CompatibilityManager.getMetadataComp(
      this._notebookPanel.context.model,
      Selectors.notebookId
    );

    if (!notebookId) {
      this._connectedTeammates = [];
      return;
    }

    try {
      const teammates = await getConnectedTeammates(notebookId);
      this._connectedTeammates = teammates;
      this._render();
    } catch (error) {
      console.error(`${APP_ID}: Error fetching connected teammates:`, error);
      this._connectedTeammates = [];
    }
  }

  /**
   * Fetch initial locations from the backend
   */
  private async _fetchInitialLocations() {
    if (this._fetchTeammateLocationsCallback && this._notebookPanel) {
      const notebookId = CompatibilityManager.getMetadataComp(
        this._notebookPanel.context.model,
        Selectors.notebookId
      );
      if (!notebookId) {
        console.log(`${APP_ID}: No notebook ID found, skipping fetch`);
        this._render();
        return;
      }
      try {
        const locations =
          await this._fetchTeammateLocationsCallback(notebookId);
        this._teammateLocations.clear();
        if (Array.isArray(locations)) {
          for (const loc of locations) {
            this._teammateLocations.set(loc.userId, loc);
          }
        }
        this._render();
      } catch (error) {
        console.error(`${APP_ID}: Error fetching teammate locations:`, error);
        this._render();
      }
    } else {
      console.log(`${APP_ID}: No fetch callback or no panel, skipping fetch`);
      this._render();
    }
  }

  /**
   * Update a teammate's location (called from WebsocketManager callback)
   */
  public updateTeammateLocation(location: ITeammateLocation) {
    this._teammateLocations.set(location.userId, location);

    // Also add to connected teammates if not already there
    if (!this._connectedTeammates.includes(location.userId)) {
      this._connectedTeammates.push(location.userId);
    }

    this._render();
  }

  /**
   * Remove a teammate's location (called when they disconnect)
   */
  public removeTeammateLocation(userId: string) {
    this._teammateLocations.delete(userId);
    this._connectedTeammates = this._connectedTeammates.filter(
      id => id !== userId
    );
    this._render();
  }

  /**
   * Regenerate headings when notebook content changes
   */
  public async refresh() {
    if (this._notebookPanel) {
      this._generateHeadings();
      await this._fetchConnectedTeammates();
      await this._fetchInitialLocations();
    } else {
      this._render();
    }
  }

  /**
   * Generate headings from the notebook (simplified TOC generation)
   */
  private _generateHeadings() {
    this._headings = [];
    if (!this._notebookPanel) {
      return;
    }

    // Get the cell mapping using the utility function
    const origCellMapping = getOrigCellMapping(this._notebookPanel);

    const notebook = this._notebookPanel.content;
    for (let i = 0; i < notebook.widgets.length; i++) {
      const cell: Cell = notebook.widgets[i];
      const model = cell.model;
      const cellId = model.id;

      // Get the orig_cell_id from the mapping (falls back to cellId if not found)
      const origCellId = origCellMapping[i] || cellId;

      if (model.type === 'markdown') {
        const source = model.sharedModel.getSource();

        // Extract headers from markdown
        const lines = source.split('\n');
        for (const line of lines) {
          const match = line.match(/^(#{1,6})\s+(.+)/);
          if (match) {
            const level = match[1].length;
            const text = match[2].trim();
            this._headings.push({
              text,
              level,
              cellId,
              origCellId,
              cellIndex: i,
              type: 'header'
            });
            break; // Only take the first header from each cell
          }
        }

        // If no header found, use first line as markdown content
        if (
          !this._headings.some(h => h.cellId === cellId) &&
          source.trim().length > 0
        ) {
          const firstLine = source.split('\n')[0].substring(0, 50);
          this._headings.push({
            text: firstLine + (source.length > 50 ? '...' : ''),
            level: 7, // Lower level than headers
            cellId,
            origCellId,
            cellIndex: i,
            type: 'markdown'
          });
        }
      } else if (model.type === 'code') {
        const source = model.sharedModel.getSource();
        if (source.trim().length > 0) {
          // Use first line of code cell
          const firstLine = source.split('\n')[0].substring(0, 40);
          this._headings.push({
            text: `[${i + 1}] ${firstLine}${source.length > 40 ? '...' : ''}`,
            level: 7,
            cellId,
            origCellId,
            cellIndex: i,
            type: 'code'
          });
        }
      }
    }
  }

  /**
   * Get teammates at a specific cell (matches by orig_cell_id)
   * Only returns teammates if this heading is the last one with this origCellId
   * (to avoid showing on both original and "Your Code" cells)
   */
  private _getTeammatesAtCell(heading: IHeading): string[] {
    // Find all headings with the same origCellId
    const headingsWithSameOrigId = this._headings.filter(
      h => h.origCellId === heading.origCellId
    );

    // Only show teammates on the last heading with this origCellId
    // This ensures that if "Your Code" exists, only it gets highlighted
    // If it doesn't exist, the original cell gets highlighted
    const lastHeading =
      headingsWithSameOrigId[headingsWithSameOrigId.length - 1];
    if (heading.cellId !== lastHeading.cellId) {
      return [];
    }

    const teammates: string[] = [];
    this._teammateLocations.forEach((loc, userId) => {
      // Compare using orig_cell_id for proper matching
      if (loc.cellId === heading.origCellId) {
        teammates.push(userId);
      }
    });
    return teammates;
  }

  /**
   * Generate a color for a user based on their ID
   */
  private _getUserColor(userId: string): string {
    // Generate a consistent color from the userId
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  /**
   * Create a short display name from user ID
   */
  private _getShortName(userId: string): string {
    // Take first 8 characters or use full ID if shorter
    return userId.length > 8 ? userId.substring(0, 8) + '...' : userId;
  }

  /**
   * Render the sidebar content
   */
  private _render() {
    // Update header with count - use connected teammates count
    const connectedCount = this._connectedTeammates.length;
    const locationsCount = this._teammateLocations.size;

    this._headerDiv.innerHTML = `
      <h3>📍 Teammate Locations</h3>
      <div class="teammate-location-header-info">
        <span class="teammate-location-count">${connectedCount} teammate${connectedCount !== 1 ? 's' : ''} online</span>
        <button class="teammate-location-refresh-btn" title="Refresh teammates">↻</button>
      </div>
    `;

    // Add refresh button handler
    const refreshBtn = this._headerDiv.querySelector(
      '.teammate-location-refresh-btn'
    );
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Clear content
    this._contentDiv.innerHTML = '';

    if (!this._notebookPanel) {
      this._contentDiv.innerHTML =
        '<p class="teammate-location-empty">No notebook open</p>';
      return;
    }

    if (this._headings.length === 0) {
      this._contentDiv.innerHTML =
        '<p class="teammate-location-empty">No content to display</p>';
      return;
    }

    // Show info if there are connected teammates but no locations yet
    if (connectedCount > 0 && locationsCount === 0) {
      const infoDiv = document.createElement('div');
      infoDiv.className = 'teammate-location-info';
      infoDiv.textContent = `${connectedCount} teammate${connectedCount !== 1 ? 's' : ''} connected. Waiting for them to navigate...`;
      this._contentDiv.appendChild(infoDiv);
    }

    // Create TOC list
    const tocList = document.createElement('ul');
    tocList.className = 'teammate-location-toc-list';

    for (const heading of this._headings) {
      const item = document.createElement('li');
      item.className = `teammate-location-toc-item level-${heading.level} type-${heading.type}`;

      // Create heading text
      const textSpan = document.createElement('span');
      textSpan.className = 'teammate-location-toc-text';
      textSpan.textContent = heading.text;
      textSpan.onclick = () => this._scrollToCell(heading.cellIndex);

      // Check for teammates at this cell - use origCellId for matching
      // Only shows on the last cell with this origCellId (the "Your Code" cell if it exists)
      const teammatesAtCell = this._getTeammatesAtCell(heading);

      // Create teammates indicator
      if (teammatesAtCell.length > 0) {
        const teammateIndicator = document.createElement('div');
        teammateIndicator.className = 'teammate-location-indicators';

        for (const userId of teammatesAtCell) {
          const dot = document.createElement('span');
          dot.className = 'teammate-location-dot';
          dot.style.backgroundColor = this._getUserColor(userId);
          dot.title = this._getShortName(userId);
          teammateIndicator.appendChild(dot);
        }

        item.appendChild(teammateIndicator);
      }

      item.appendChild(textSpan);
      tocList.appendChild(item);
    }

    this._contentDiv.appendChild(tocList);

    // Add legend if there are teammates
    if (this._teammateLocations.size > 0) {
      const legend = document.createElement('div');
      legend.className = 'teammate-location-legend';
      legend.innerHTML = '<h4>Teammates</h4>';

      const legendList = document.createElement('ul');
      legendList.className = 'teammate-location-legend-list';

      this._teammateLocations.forEach((loc, userId) => {
        const legendItem = document.createElement('li');
        legendItem.className = 'teammate-location-legend-item';

        const dot = document.createElement('span');
        dot.className = 'teammate-location-dot';
        dot.style.backgroundColor = this._getUserColor(userId);

        const name = document.createElement('span');
        name.textContent = this._getShortName(userId);

        legendItem.appendChild(dot);
        legendItem.appendChild(name);
        legendList.appendChild(legendItem);
      });

      legend.appendChild(legendList);
      this._contentDiv.appendChild(legend);
    }
  }

  /**
   * Scroll to a specific cell in the notebook
   */
  private _scrollToCell(cellIndex: number) {
    if (this._notebookPanel) {
      this._notebookPanel.content.activeCellIndex = cellIndex;
      this._notebookPanel.content.mode = 'command';
      this._notebookPanel.content.scrollToItem(cellIndex, 'center');
    }
  }
}
