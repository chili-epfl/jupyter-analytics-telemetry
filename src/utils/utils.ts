import { IOutput, MultilineString, IMimeBundle } from '@jupyterlab/nbformat';
import { PartialJSONObject } from '@lumino/coreutils';
import { NotebookPanel } from '@jupyterlab/notebook';
import { Selectors } from './constants';
import { CompatibilityManager } from './compatibility';
import { disabledNotebooksSignaler, isDashboardExtensionInstalled } from '..';

// returns the notebookId if defined, null otherwise
export const isNotebookValid = (panel: NotebookPanel): string | null => {
  if (panel && !panel.isDisposed) {
    const notebookId = CompatibilityManager.getMetadataComp(
      panel.context.model,
      Selectors.notebookId
    );
    const cellMapping = CompatibilityManager.getMetadataComp(
      panel.context.model,
      Selectors.cellMapping
    );

    if (notebookId && cellMapping) {
      // to block the traffic if the user also has the dashboard extension for that notebook
      if (isDashboardExtensionInstalled) {
        // if the disabledNotebooks list has not been received yet or this notebook is in the list of disabled notebooks, block the traffic
        if (
          disabledNotebooksSignaler.value === null ||
          disabledNotebooksSignaler.value.includes(notebookId)
        ) {
          return null;
        }
      }

      return notebookId;
    }
  }
  return null;
};

export const compareVersions = (version1: string, version2: string): number => {
  // extract numeric parts by splitting at non-digit characters
  const parts1 = version1.split(/[^0-9]+/).map(Number);
  const parts2 = version2.split(/[^0-9]+/).map(Number);

  for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
    const num1 = parts1[i];
    const num2 = parts2[i];

    if (num1 !== num2) {
      return num1 - num2;
    }
  }

  // if all numeric parts are equal, compare the string parts
  const str1 = version1.replace(/[0-9]+/g, '');
  const str2 = version2.replace(/[0-9]+/g, '');

  return str1.localeCompare(str2);
};

// function to compute the length as a string of the content of JSON IOutput message objects as described in the Jupyterlab docs
export const computeLength = (
  value: MultilineString | PartialJSONObject
): number => {
  let totalLength = 0;
  if (typeof value === 'string') {
    totalLength = value.length;
  } else if (Array.isArray(value)) {
    for (const str of value) {
      totalLength += str.length;
    }
  } else {
    for (const key in value) {
      totalLength += JSON.stringify(value[key]).length;
    }
  }
  return totalLength;
};

export const processCellOutput = (outputs: IOutput[]) => {
  let cell_output_length = 0;
  let status = 'ok';
  for (const output of outputs) {
    const output_type: string = output.output_type;
    if (output_type === 'stream') {
      const multilineStr = output.text as MultilineString;
      cell_output_length += computeLength(multilineStr);
    } else if (output_type === 'error') {
      // only change status to error if an error message occurred
      status = 'error';
      cell_output_length += (output.evalue as string).length;
    } else if (output_type === 'execute_result') {
      cell_output_length += computeLength(output.data as IMimeBundle);
    } else if (output_type === 'display_data') {
      cell_output_length += computeLength(output.data as IMimeBundle);
    } else {
      cell_output_length += 0;
    }
  }
  return {
    status,
    cell_output_length
  };
};
