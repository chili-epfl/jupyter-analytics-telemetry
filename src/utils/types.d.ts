import { IOutput } from '@jupyterlab/nbformat';

type StringId = string | null | undefined;

interface IBaseEvent {
  notebook_id: string;
}

export interface ICodeExecObject extends IBaseEvent {
  cell_id: string;
  orig_cell_id: StringId;
  t_start: string;
  t_finish: string;
  status: string;
  cell_input: string;
  cell_output_model: IOutput[];
  cell_output_length: number;
  language_mimetype: string;
}

export interface IMarkdownExecObject extends IBaseEvent {
  cell_id: string;
  orig_cell_id: StringId;
  time: string;
  cell_content: string;
}

interface IClick extends IBaseEvent {
  click_type: string; // ON or OFF
  time: string;
  click_duration: number | null;
}

export interface INotebookClickObject extends IClick {}

export interface ICellClickObject extends IClick {
  cell_id: string;
  orig_cell_id: StringId;
}

export interface ICellAlterationObject extends IBaseEvent {
  cell_id: string;
  alteration_type: string; // ADD or REMOVE
  time: string;
}

export type PostDataObject =
  | ICodeExecObject
  | IMarkdownExecObject
  | INotebookClickObject
  | ICellClickObject
  | ICellAlterationObject;
