import { Hono } from "hono";
import { requireAuth } from "../../infra/middleware/auth";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import * as requisitionsController from "./requisitions.controller";

const router = new Hono();

router.use("*", requireAuth);

router.post("/", requisitionsController.createRequisition);

router.get("/", requisitionsController.listRequisitions);

router.post(
  "/:id/action",
  requireOrgPermission("finance:approve_funds"),
  requisitionsController.actionRequisition,
);

export { router as requisitionsRouter };
