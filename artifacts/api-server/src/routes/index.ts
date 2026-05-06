import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import serversRouter from "./servers";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(serversRouter);
router.use(dashboardRouter);

export default router;
