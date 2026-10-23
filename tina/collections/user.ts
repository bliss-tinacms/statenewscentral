import type { Collection } from "tinacms";
import { seoFields } from "../fields/seo";

export const UserCollection: Collection = {
  name: "user",
  label: "Users",
  path: "src/content/user",
  format: "json",
  ui: {
    router({ document }) {
      return `/author/${document._sys.filename}/`;
    },
  },
  fields: [
    {
      type: "string",
      name: "name",
      label: "Name",
      isTitle: true,
      required: true,
    },
    {
      type: "string",
      name: "role",
      label: "Role / Title",
    },
    {
      type: "image",
      name: "avatar",
      label: "Avatar",
    },
    {
      type: "string",
      name: "bio",
      label: "Bio",
      ui: {
        component: "textarea",
      },
    },
    {
      type: "string",
      name: "email",
      label: "Email",
    },
    { type: "string", name: "location", label: "Location" },
    {
      type: "string",
      name: "teamGroup",
      label: "Team Group",
      options: ["Leadership", "Senior Editors", "Contributors"],
    },
    { type: "number", name: "teamOrder", label: "Team Display Order" },
    { type: "boolean", name: "showOnTeam", label: "Show on Team Page" },
    seoFields,
  ],
};
