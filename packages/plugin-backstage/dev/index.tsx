import React from "react";
import { createDevApp } from "@backstage/dev-utils";
import { kubernautPlugin, KubernautPage } from "../src";

createDevApp()
  .registerPlugin(kubernautPlugin)
  .addPage({
    element: <KubernautPage />,
    title: "Kubernaut",
    path: "/kubernaut",
  })
  .render();
