import {
  Grid,
  GridModel,
  RemoteDataSource,
  xlsx,
  type Options,
} from "../src/index.js";
interface RecordRow {
  id: string;
  amount: number;
  region: string;
}
const options: Options<RecordRow> = {
  rows: [{ id: "1", amount: 10, region: "East" }],
  columns: [
    {
      field: "amount",
      type: "number",
      editable: true,
      aggregate: "sum",
      validate: (value) => (value < 0 ? "Negative" : null),
    },
    { field: "region" },
  ],
};
const model = new GridModel(options);
model.setState({
  advancedFilter: {
    op: "and",
    rules: [{ column: "amount", op: "gte", value: 10 }],
  },
});
model.transaction({ update: [{ id: "1", amount: 12 }] });
const grid = new Grid(document.createElement("div"), options);
grid.restoreState(grid.getState());
const source = new RemoteDataSource<RecordRow>(async (request) => ({
  rows: [],
  total: request.start,
}));
source.getBlock(0);
xlsx([{ rows: [["amount"], [10]] }]);
grid.destroy();
