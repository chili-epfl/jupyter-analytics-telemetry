import { Socket, io } from 'socket.io-client';
import { PERSISTENT_USER_ID } from '..';
import { WEBSOCKET_API_URL } from '../dataCollectionPlugin';
import { APP_ID } from '../utils/constants';

export interface ITeammateLocation {
  userId: string;
  cellId: string;
  cellIndex?: number;
}

export class WebsocketManager {
  constructor() {
    this._socket = null;
  }


  private _messageCallback: ((message: string, sender: string, senderType: 'teacher' | 'teammate') => void) | null =
    null;
  private _teammateChangeCallback: (() => void) | null = null;
  private _locationUpdateCallback:
    | ((location: ITeammateLocation) => void)
    | null = null;
  private _locationClearedCallback: ((userId: string) => void) | null = null;

  private _createSocket(notebookId: string, userId: string) {
    this._socket = io(
      `${WEBSOCKET_API_URL}?conType=STUDENT&nbId=${notebookId}&userId=${userId}`,
      {
        // path: "/api/unilytics/socket.io", // UNCOMMENT THIS IF NEEDED
        transports: ['websocket'] // do not add "polling" as it would require sticky sessions on the load balancer (e.g., AWS), which means routing all requests from the same IP to the same instance
      }
    );

    this._socket.on('connect', () => {
      console.log(`${APP_ID}: SocketIO connection opened for:`, {
        notebookId,
        userId
      });
    });

    this._socket.on('disconnect', (event: any) => {
      console.log(
        `${APP_ID}: SocketIO connection closed (reason: ${event}) for:`,
        { notebookId, userId }
      );
    });

    this._socket.on('chat', (data: { message: string; sender: string; sender_type?: string } | string) => {
      if (this._messageCallback) {
        // Handle both old string format and new object format
        if (typeof data === 'string') {
          // Old format: "From {user_id}: {message}"
          let senderId = 'teacher';
          const fromMatch = data.match(/^From\s+([^:]+):/);
          if (fromMatch && fromMatch[1]) {
            senderId = fromMatch[1].trim();
          }
          this._messageCallback(data, senderId, 'teacher');
        } else {
          // New format: { message: string, sender: string, sender_type: string }
          const senderType: 'teacher' | 'teammate' = data.sender_type === 'teacher' ? 'teacher' : 'teammate';
          this._messageCallback(data.message, data.sender, senderType);
        }
      }
    });

    this._socket.on('group_chat', (data: { message: string; sender: string; sender_type?: string } | string) => {
      if (this._messageCallback) {
        // Handle both old string format and new object format
        if (typeof data === 'string') {
          // Old format: "From {user_id}: {message}"
          let senderId = 'teammate';
          const fromMatch = data.match(/^From\s+([^:]+):/);
          if (fromMatch && fromMatch[1]) {
            senderId = fromMatch[1].trim();
          }
          this._messageCallback(data, senderId, 'teammate');
        } else {
          // New format: { message: string, sender: string, sender_type: string }
          const senderType: 'teacher' | 'teammate' = data.sender_type === 'teacher' ? 'teacher' : 'teammate';
          this._messageCallback(data.message, data.sender, senderType);
        }
      }
    });

    this._socket.on('teammate_connected', (data: { userId: string }) => {
      console.log(`${APP_ID}: Teammate connected:`, data.userId);
      // Trigger callback to refresh teammates list
      if (this._teammateChangeCallback) {
        this._teammateChangeCallback();
      }
    });

    this._socket.on('teammate_disconnected', (data: { userId: string }) => {
      console.log(`${APP_ID}: Teammate disconnected:`, data.userId);
      // Trigger callback to refresh teammates list
      if (this._teammateChangeCallback) {
        this._teammateChangeCallback();
      }
    });

    this._socket.on(
      'teammate_location_update',
      (data: { userId: string; cellId: string; cellIndex?: number }) => {
        console.log(`${APP_ID}: *** RECEIVED teammate_location_update ***:`, data);
        if (this._locationUpdateCallback) {
          console.log(`${APP_ID}: Calling location update callback`);
          this._locationUpdateCallback(data);
        } else {
          console.log(`${APP_ID}: WARNING - No location update callback registered!`);
        }
      }
    );

    this._socket.on(
      'teammate_location_cleared',
      (data: { userId: string }) => {
        console.log(`${APP_ID}: Teammate location cleared:`, data.userId);
        if (this._locationClearedCallback) {
          this._locationClearedCallback(data.userId);
        }
      }
    );

    this._socket.on('connect_error', (event: any) => {
      console.error(`${APP_ID}: SocketIO error; `, event);
    });
  }

  public establishSocketConnection(
    notebookId: string | null,
    onMessage: (message: string, sender: string, senderType: 'teacher' | 'teammate') => void
  ) {
    // if there is already a connection, close it and set the socket to null
    this.closeSocketConnection();

    this._messageCallback = onMessage; // Register the callback

    if (!notebookId || !PERSISTENT_USER_ID) {
      return;
    }
    this._createSocket(notebookId, PERSISTENT_USER_ID);
  }

  public closeSocketConnection() {
    if (this._socket) {
      this._socket.close();
    }
    this._socket = null;
  }

  public sendMessageToTeammates(userId: string, message: string) {
    if (this._socket) {
      this._socket.emit('group_message', { userId, message });
    }
  }

  // Register a callback for teammate changes
  public onTeammateChange(callback: () => void) {
    this._teammateChangeCallback = callback;
  }

  // Register callbacks for location tracking
  public onLocationUpdate(callback: (location: ITeammateLocation) => void) {
    console.log(`${APP_ID}: Registering location update callback`);
    this._locationUpdateCallback = callback;
  }

  public onLocationCleared(callback: (userId: string) => void) {
    this._locationClearedCallback = callback;
  }

  // Send location update to teammates
  public sendLocationUpdate(cellId: string, cellIndex?: number) {
    if (this._socket) {
      console.log(`${APP_ID}: Sending location update via WebSocket:`, { cellId, cellIndex });
      this._socket.emit('update_location', { cellId, cellIndex });
    } else {
      console.log(`${APP_ID}: Cannot send location update - no socket connection`);
    }
  }

  private _socket: Socket | null;
}
