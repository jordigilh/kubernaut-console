import {
  createPlugin,
  createRoutableExtension,
} from "@backstage/core-plugin-api";
import { rootRouteRef } from "./routes";

export const kubernautPlugin = createPlugin({
  id: "kubernaut",
  routes: {
    root: rootRouteRef,
  },
});

export const KubernautPage = kubernautPlugin.provide(
  createRoutableExtension({
    name: "KubernautPage",
    component: () =>
      import("./components/KubernautPluginPage").then(
        (m) => m.KubernautPluginPage
      ),
    mountPoint: rootRouteRef,
  })
);
