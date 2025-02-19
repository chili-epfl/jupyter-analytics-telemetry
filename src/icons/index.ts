import { APP_ID } from '../utils/constants';
import { LabIcon } from '@jupyterlab/ui-components';
import chatStr from '../../style/icons/chat2.svg';

export const chatIcon = new LabIcon({
  name: `${APP_ID}:chat-icon`,
  svgstr: chatStr
});
