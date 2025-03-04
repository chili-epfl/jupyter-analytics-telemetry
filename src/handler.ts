import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
  // make request to Jupyter API
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(
    settings.baseUrl,
    'jupyterlab-unianalytics-telemetry', // API Namespace
    endPoint
  );

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as any);
  }

  const data: any = await response.text();

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message || data);
  }

  return data;
}
