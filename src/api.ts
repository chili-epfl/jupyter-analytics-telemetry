import { PERSISTENT_USER_ID } from '.';
import { BACKEND_API_URL } from './dataCollectionPlugin';
import { APP_ID, MAX_PAYLOAD_SIZE } from './utils/constants';
import {
  ICellAlterationObject,
  ICellClickObject,
  ICodeExecObject,
  INotebookClickObject,
  IMarkdownExecObject,
  PostDataObject
} from './utils/types';

const postRequest = (data: PostDataObject, endpoint: string): void => {
  if (!PERSISTENT_USER_ID) {
    console.log(`${APP_ID}: No user id`);
    return;
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
      return;
    } else {
      console.log(`${APP_ID}: Posting to ` + endpoint + ' :\n', dataWithUser);
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload
      }).then(response => {
        response
          .json()
          .then(responseData => console.log(`${APP_ID}: ` + responseData));
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
