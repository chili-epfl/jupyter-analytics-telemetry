import { PERSISTENT_USER_ID } from '..';
import { WEBSOCKET_API_URL } from '../dataCollectionPlugin';
import { APP_ID } from '../utils/constants';
import { Socket, io } from 'socket.io-client';

export class WebsocketManager {
  constructor() {
    this._socket = null;
  }

  private _messageCallback: ((message: string, sender: string) => void) | null =
    null;

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

    this._socket.on('chat', (message: string) => {
      if (this._messageCallback) {
        this._messageCallback(message, 'teacher'); // Call the registered callback
      }
    });

    this._socket.on('group_chat', (message: string) => {
      if (this._messageCallback) {
        this._messageCallback(message, 'teammate'); // Call the registered callback
      }
    });

    this._socket.on('connect_error', (event: any) => {
      console.error(`${APP_ID}: SocketIO error; `, event);
    });
  }

  public establishSocketConnection(
    notebookId: string | null,
    onMessage: (message: string, sender: string) => void
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

  private _socket: Socket | null;
}
