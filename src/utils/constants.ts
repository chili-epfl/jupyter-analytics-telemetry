export const APP_ID = 'jupyterlab_unianalytics_telemetry';

export const MAX_PAYLOAD_SIZE = 1048576; // 1*1024*1024 => 1Mb

export const EXTENSION_SETTING_NAME = 'SendExtension';

// notebook metadata field names
const SELECTOR_ID = 'unianalytics';
export namespace Selectors {
  export const notebookId = `${SELECTOR_ID}_notebook_id`;

  export const cellMapping = `${SELECTOR_ID}_cell_mapping`;
}

export namespace CommandIDs {
  export const dashboardOpenChat = `${APP_ID}:unianalytics-open-chat`;

  export const pushCellUpdate = `${APP_ID}:group-push-cell-update`;
}
