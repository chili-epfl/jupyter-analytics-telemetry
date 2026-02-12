import { PERSISTENT_USER_ID } from '.';
import { BACKEND_API_URL } from './dataCollectionPlugin';
import { APP_ID, MAX_PAYLOAD_SIZE } from './utils/constants';
import {
  ICellAlterationObject,
  ICellClickObject,
  ICodeExecObject,
  INotebookClickObject,
  IMarkdownExecObject,
  IPendingUpdateInteractionObject,
  PostDataObject
} from './utils/types';

const postRequest = (data: PostDataObject, endpoint: string): void => {
  if (!PERSISTENT_USER_ID) {
    console.log(`${APP_ID}: No user id`);
  } else {
    // add the user_id to the payload
    const dataWithUser = {
      ...data,
      user_id: PERSISTENT_USER_ID
    };

    const payload = JSON.stringify(dataWithUser);
    const url = BACKEND_API_URL + endpoint;

    if (payload.length > MAX_PAYLOAD_SIZE) {
      console.log(
        `${APP_ID}: Payload size exceeds limit of ${MAX_PAYLOAD_SIZE / 1024 / 1024} Mb`
      );
    } else {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload
      }).catch(error => {
        console.log(`${APP_ID}: Post request failed`, error);
      });
    }
  }
};

export const postCodeExec = (cellExec: ICodeExecObject): void => {
  postRequest(cellExec, 'exec/code');
};

export const postMarkdownExec = (markdownExec: IMarkdownExecObject): void => {
  postRequest(markdownExec, 'exec/markdown');
};

export const postCellClick = (cellClick: ICellClickObject): void => {
  postRequest(cellClick, 'clickevent/cell');
};

export const postNotebookClick = (
  notebookClick: INotebookClickObject
): void => {
  postRequest(notebookClick, 'clickevent/notebook');
};

export const postCellAlteration = (
  cellAlteration: ICellAlterationObject
): void => {
  postRequest(cellAlteration, 'alter');
};

export const postPendingUpdateInteraction = (
  interaction: IPendingUpdateInteractionObject
): void => {
  postRequest(interaction, 'pending_update_interaction');
};
