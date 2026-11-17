export type Row = Record<string, any>;
export type Aggregate =
  "sum" | "count" | "min" | "max" | "avg" | "first" | "last";
export interface Column<T extends Row = Row> {
  id?: string;
  field?: keyof T & string;
  title?: string;
  width?: number;
  hidden?: boolean;
  pinned?: "left" | "right" | null;
  type?: "string" | "number" | "boolean" | "date";
  editable?: boolean;
  options?: any[];
  sparkline?: boolean;
  value?: (row: T) => any;
  format?: (value: any, row: T) => string;
  render?: (value: any, row: T) => Node | string;
  parse?: (input: any, row: T) => any;
  validate?: (value: any, row: T) => string | null | undefined;
  compare?: (a: any, b: any) => number;
  aggregate?: Aggregate | ((values: any[]) => any);
}
export type ResolvedColumn<T extends Row = Row> = Column<T> & { id: string };
export type Filter =
  | {
      op:
        | "contains"
        | "startsWith"
        | "endsWith"
        | "eq"
        | "ne"
        | "gt"
        | "gte"
        | "lt"
        | "lte";
      value: any;
      column?: string;
    }
  | { op: "between"; value: any; to: any; inclusive?: boolean; column?: string }
  | { op: "in"; values: any[]; column?: string }
  | { op: "blank" | "notBlank"; column?: string }
  | { op: "and" | "or"; rules: Filter[] };
export interface Pivot {
  rows: string[];
  columns: string[];
  values: { id: string; aggregate: Aggregate }[];
}
export interface State {
  sort: { id: string; dir: "asc" | "desc" }[];
  filters: Record<string, Filter>;
  quick: string;
  advancedFilter?: Filter | null;
  groupBy: string[];
  expanded: string[];
  pivot: Pivot | null;
  page: number;
  pageSize: number;
}
export interface SavedState extends State {
  columns: Pick<ResolvedColumn, "id" | "width" | "hidden" | "pinned">[];
  selection: string[];
}
export interface Entry<T extends Row = Row> {
  id: string;
  data: T;
}
export interface ViewNode<T extends Row = Row> extends Entry<T> {
  kind: "row" | "group" | "pivot";
  depth: number;
  children?: ViewNode<T>[];
  label?: any;
  count?: number;
  entry?: Entry<T>;
}
export interface View<T extends Row = Row> {
  rows: ViewNode<T>[];
  columns: ResolvedColumn<T>[];
  total: number;
  page: number;
  filtered: number;
  aggregates: Record<string, any>;
}
export interface Options<T extends Row = Row> {
  columns: Column<T>[];
  rows?: T[];
  getRowId?: (row: T) => string | number;
  state?: Partial<State>;
  externalFilter?: (row: T) => boolean;
  treePath?: (row: T) => (string | number)[];
  historyLimit?: number;
  height?: number | string;
  rowHeight?: number;
  theme?: "light" | "dark";
  label?: string;
  detail?: (row: T) => Node | string;
  contextMenu?: { label: string; action: (row: T, grid: Grid<T>) => void }[];
  onError?: (error: Error) => void;
  dataSource?: RemoteDataSource<T>;
}
export interface Edit {
  id: string;
  columnId: string;
  value: any;
}
export interface Change {
  id: string;
  field: string;
  columnId: string;
  before: any;
  after: any;
}
export class GridModel<T extends Row = Row> {
  constructor(options: Options<T>);
  options: Options<T>;
  columns: ResolvedColumn<T>[];
  state: State;
  rows: Entry<T>[];
  byId: Map<string, Entry<T>>;
  selected: Set<string>;
  on(type: "change", handler: (state: SavedState) => void): () => void;
  on(type: "edit", handler: (changes: Change[]) => void): () => void;
  on(type: "selection", handler: (ids: string[]) => void): () => void;
  replaceRows(rows: T[], notify?: boolean): void;
  value(entry: Entry<T>, column: string | Column<T>): any;
  filteredRows(): Entry<T>[];
  sortedRows(rows: Entry<T>[]): Entry<T>[];
  aggregate(rows: Entry<T>[]): Record<string, any>;
  group(
    rows: Entry<T>[],
    fields?: string[],
    depth?: number,
    path?: any[],
  ): ViewNode<T>[];
  tree(rows: Entry<T>[]): ViewNode<T>[];
  pivot(
    rows?: Entry<T>[],
  ): { columns: ResolvedColumn<T>[]; rows: ViewNode<T>[] } | null;
  view(): View<T>;
  setState(patch: Partial<State>): void;
  getState(): SavedState;
  restoreState(state: Partial<SavedState>): void;
  toggleGroup(id: string): void;
  select(ids: (string | number)[], mode?: "replace" | "add" | "toggle"): void;
  edit(id: string, columnId: string, value: any): void;
  editMany(edits: Edit[]): void;
  undo(): void;
  redo(): void;
  transaction(transaction: {
    add?: T[];
    update?: Partial<T>[];
    remove?: (string | number)[];
  }): void;
  setColumn(
    id: string,
    patch: Pick<Column<T>, "width" | "hidden" | "pinned">,
  ): void;
  moveColumn(id: string, beforeId: string): void;
}
export interface RemoteRequest {
  start: number;
  end: number;
  signal: AbortSignal;
  sort?: State["sort"];
  filters?: State["filters"];
  quick?: string;
  advancedFilter?: Filter | null;
  [key: string]: any;
}
export class RemoteDataSource<T extends Row = Row> {
  constructor(
    fetchRows: (
      request: RemoteRequest,
    ) => Promise<{ rows: T[]; total: number }>,
    options?: { blockSize?: number; maxBlocks?: number },
  );
  blockSize: number;
  getBlock(
    index: number,
    query?: Record<string, any>,
  ): Promise<{ rows: T[]; total: number }>;
  invalidate(): void;
  destroy(): void;
}
export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}
export class Grid<T extends Row = Row> {
  constructor(container: HTMLElement, options: Options<T>);
  model: GridModel<T>;
  root: HTMLElement;
  viewport: HTMLElement;
  range: Range | null;
  setRows(rows: T[]): void;
  getState(): SavedState;
  restoreState(state: Partial<SavedState>): void;
  destroy(): void;
  copy(): string;
  paste(text: string): void;
  fillDown(): void;
  loadRemote(): Promise<void>;
  showChart(category: string, value: string, type?: "bar" | "line"): void;
  exportRows(options?: { selected?: boolean }): any[][];
  exportCSV(options?: { selected?: boolean }): string;
  exportXLSX(options?: { selected?: boolean }): Uint8Array;
}
export const aggregates: Record<Aggregate, (values: any[]) => any>;
export function matches(
  value: any,
  filter?: Filter | null,
  type?: Column["type"],
): boolean;
export function delimited(
  rows: any[][],
  separator?: string,
  options?: { safe?: boolean },
): string;
export function parseDelimited(input: string, separator?: string): string[][];
export function xlsx(
  sheets: { name?: string; rows: any[][]; freezeHeader?: boolean }[],
): Uint8Array;
export function download(
  content: BlobPart,
  filename: string,
  mime?: string,
): void;
export function sparkline(
  values: number[],
  options?: { width?: number; height?: number; color?: string },
): SVGSVGElement;
export function chart(
  rows: Row[],
  options: {
    category: string;
    value: string;
    type?: "bar" | "line";
    width?: number;
    height?: number;
    onSelect?: (row: Row) => void;
  },
): SVGSVGElement;
