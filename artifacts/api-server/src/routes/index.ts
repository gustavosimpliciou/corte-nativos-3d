import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import modelsRouter from "./models";
import operationsRouter from "./operations";
import exportsRouter from "./exports";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(modelsRouter);
router.use(operationsRouter);
router.use(exportsRouter);
router.use(statsRouter);

export default router;
