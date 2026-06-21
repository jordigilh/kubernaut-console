import React from "react";
import {
  createFrontendPlugin,
  PageBlueprint,
} from "@backstage/frontend-plugin-api";
import { rootRouteRef } from "./routes";

const kubernautPage = PageBlueprint.make({
  params: {
    defaultPath: "/kubernaut",
    routeRef: rootRouteRef,
    loader: () =>
      import("./components/NfsKubernautPage").then((m) => (
        <m.NfsKubernautPage />
      )),
  },
});

export default createFrontendPlugin({
  pluginId: "kubernaut",
  extensions: [kubernautPage],
  routes: {
    root: rootRouteRef,
  },
});
