import { Schema, model, type Model } from "mongoose";

const FieldSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  label: String,
  type: { type: String, required: true },
  placeholder: String,
  validation: Schema.Types.Mixed,
});

const PageSchema = new Schema({
  id: { type: String, required: true },
  title: String,
  fields: [FieldSchema],
});

const FormScriptRefSchema = new Schema({
  scriptId: { type: Schema.Types.ObjectId, ref: "Script", required: true },
  event: { type: String, required: true },
  order: { type: Number, default: 0 },
});

const FlowStepSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ["page", "script", "start", "end"] },
    pageId: String,
    scriptId: { type: Schema.Types.ObjectId, ref: "Script" },
    event: String,
    onSubmit: String,
    onSuccess: String,
    onError: String,
    next: String,
    outcome: { type: String, enum: ["success", "failure"] },
    position: {
      x: Number,
      y: Number,
    },
  },
  { _id: false }
);

const FormSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    pages: [PageSchema],
    scripts: [FormScriptRefSchema],
    flow: [FlowStepSchema],
    currentVersionId: { type: Schema.Types.ObjectId, ref: "FormVersion" },
  },
  { timestamps: true }
);

export default model("Form", FormSchema) as Model<unknown>;
